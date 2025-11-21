1) Project layout (suggested)
k8s-mariadb-3tier/
├── k8s/
│   ├── web-deployment.yaml         # Nginx Deployment + Service (LoadBalancer)
│   ├── app-deployment.yaml         # Nodejs Deployment + Service + ConfigMap + Secret
│   ├── mariadb-statefulset.yaml    # MariaDB StatefulSet + Service + PVC
│   └── storage-class.yaml (optional)
├── app/
│   ├── app.js
│   ├── package.json
│   └── Dockerfile
└── README.md

2) Node.js app files (app/)

app.js

// simple express app that connects to MariaDB using env vars
const express = require('express');
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', async (req, res) => {
  const dbHost = process.env.DB_HOST || 'mariadb';
  const dbUser = process.env.DB_USER || 'root';
  const dbPass = process.env.DB_PASSWORD || 'password';
  const dbName = process.env.DB_NAME || 'appdb';
  let conn;
  try {
    conn = await mysql.createConnection({
      host: dbHost,
      user: dbUser,
      password: dbPass,
      database: dbName,
    });
    const [rows] = await conn.query('SELECT NOW() as nowtime');
    res.send(`Hello from Node.js App — DB time: ${rows[0].nowtime}\n`);
  } catch (err) {
    console.error('DB error', err);
    res.status(500).send('Cannot connect to DB: ' + err.message);
  } finally {
    if (conn) await conn.end();
  }
});

app.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`);
});


package.json

{
  "name": "k8s-node-mariadb",
  "version": "1.0.0",
  "main": "app.js",
  "scripts": {
    "start": "node app.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "mysql2": "^3.1.0"
  }
}


Dockerfile

FROM node:16-alpine
WORKDIR /app
COPY package.json .
RUN npm ci --only=production
COPY app.js .
EXPOSE 3000
CMD ["node", "app.js"]

3) Kubernetes manifests
Replace 123456789012.dkr.ecr.<region>.amazonaws.com/nodejs-app with your ECR repo image.

3.1 App ConfigMap + Secret + Deployment + Service (k8s/app-deployment.yaml)
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  APP_ENV: "production"
  LOG_LEVEL: "info"

---
apiVersion: v1
kind: Secret
metadata:
  name: db-credentials
type: Opaque
stringData:
  DB_USER: "appuser"
  DB_PASSWORD: "AppPassw0rd"
  DB_NAME: "appdb"

---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nodejs-app
  labels:
    app: nodejs-app
spec:
  replicas: 2
  selector:
    matchLabels:
      app: nodejs-app
  template:
    metadata:
      labels:
        app: nodejs-app
    spec:
      containers:
      - name: nodejs
        image: 123456789012.dkr.ecr.<region>.amazonaws.com/nodejs-app:latest
        imagePullPolicy: Always
        ports:
        - containerPort: 3000
        env:
        - name: DB_HOST
          value: "mariadb"                 # Service name for MariaDB
        - name: DB_USER
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: DB_USER
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: DB_PASSWORD
        - name: DB_NAME
          valueFrom:
            secretKeyRef:
              name: db-credentials
              key: DB_NAME
        - name: APP_ENV
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: APP_ENV
---
apiVersion: v1
kind: Service
metadata:
  name: nodejs-service
spec:
  selector:
    app: nodejs-app
  type: ClusterIP
  ports:
  - port: 80
    targetPort: 3000

3.2 Web (Nginx) Deployment + Service as load balancer (k8s/web-deployment.yaml)
We use a minimal nginx to reverse proxy to the Node service (or serve static site).

apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx-web
  labels:
    app: nginx-web
spec:
  replicas: 2
  selector:
    matchLabels:
      app: nginx-web
  template:
    metadata:
      labels:
        app: nginx-web
    spec:
      containers:
      - name: nginx
        image: nginx:1.23-alpine
        ports:
        - containerPort: 80
        volumeMounts:
        - name: nginx-conf
          mountPath: /etc/nginx/conf.d/default.conf
          subPath: default.conf
      volumes:
      - name: nginx-conf
        configMap:
          name: nginx-config

---
apiVersion: v1
kind: Service
metadata:
  name: nginx-service
spec:
  selector:
    app: nginx-web
  type: LoadBalancer
  ports:
  - port: 80
    targetPort: 80


Nginx ConfigMap referenced above (can be in same file or separate):

apiVersion: v1
kind: ConfigMap
metadata:
  name: nginx-config
data:
  default.conf: |
    server {
      listen 80;
      location / {
        proxy_pass http://nodejs-service:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
      }
    }

3.3 MariaDB StatefulSet + Service + PVC (k8s/mariadb-statefulset.yaml)
apiVersion: v1
kind: Service
metadata:
  name: mariadb
  labels:
    app: mariadb
spec:
  ports:
  - port: 3306
    name: mysql
  clusterIP: None
  selector:
    app: mariadb
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: mariadb
spec:
  selector:
    matchLabels:
      app: mariadb
  serviceName: "mariadb"
  replicas: 1
  template:
    metadata:
      labels:
        app: mariadb
    spec:
      containers:
      - name: mariadb
        image: mariadb:10.6
        env:
        - name: MYSQL_ROOT_PASSWORD
          valueFrom:
            secretKeyRef:
              name: mariadb-root-secret
              key: root-password
        - name: MYSQL_DATABASE
          valueFrom:
            secretKeyRef:
              name: mariadb-root-secret
              key: database
        - name: MYSQL_USER
          valueFrom:
            secretKeyRef:
              name: mariadb-root-secret
              key: user
        - name: MYSQL_PASSWORD
          valueFrom:
            secretKeyRef:
              name: mariadb-root-secret
              key: password
        ports:
        - containerPort: 3306
        volumeMounts:
        - name: mariadb-storage
          mountPath: /var/lib/mysql
  volumeClaimTemplates:
  - metadata:
      name: mariadb-storage
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 20Gi


Secrets for MariaDB root & user (k8s/mariadb-secrets.yaml)

apiVersion: v1
kind: Secret
metadata:
  name: mariadb-root-secret
type: Opaque
stringData:
  root-password: "RootStrongPass123!"
  database: "appdb"
  user: "appuser"
  password: "AppPassw0rd"


Note: volumeClaimTemplates will use the cluster's default StorageClass (on EKS this typically provisions EBS volumes). If you want a specific StorageClass, create it and reference it in the PVC template.

4) Commands — Build image, push to ECR, deploy to EKS
4.1 Build and push Docker image to ECR (run locally or from CI)
Replace <aws-account-id>, <region>, <repo> appropriately.

# variables
AWS_REGION=ap-south-1
AWS_ACCOUNT_ID=123456789012
REPO_NAME=nodejs-app
IMAGE_TAG=v1

# 1. Authenticate docker to ECR
aws ecr get-login-password --region $AWS_REGION \
  | docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com

# 2. Create repo (if not exists)
aws ecr create-repository --repository-name $REPO_NAME --region $AWS_REGION || true

# 3. Build & tag
docker build -t ${REPO_NAME}:${IMAGE_TAG} ./app
docker tag ${REPO_NAME}:${IMAGE_TAG} ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${REPO_NAME}:${IMAGE_TAG}

# 4. Push
docker push ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${REPO_NAME}:${IMAGE_TAG}

4.2 Update deployment YAML image & apply (in Jenkins this is automated)
Edit app-deployment.yaml container image or use kubectl set image directly:

# update via kubectl set image
kubectl set image deployment/nodejs-app nodejs=${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${REPO_NAME}:${IMAGE_TAG} -n default
Alternatively update the YAML and kubectl apply.

4.3 Deploy to EKS (kubectl apply)
Assuming your kubeconfig points to EKS cluster:

kubectl apply -f k8s/mariadb-secrets.yaml
kubectl apply -f k8s/mariadb-statefulset.yaml
kubectl apply -f k8s/app-deployment.yaml
kubectl apply -f k8s/nginx-configmap.yaml   # if in separate file
kubectl apply -f k8s/web-deployment.yaml

4.4 Check resources
kubectl get pods
kubectl get svc
kubectl get sts
kubectl describe pod <pod-name>
kubectl logs deploy/nodejs-app

4.5 Accessing the App from Local Browser
nginx-service is LoadBalancer type: get external IP / hostname:
kubectl get svc nginx-service
# or
kubectl get svc -o wide


Use the External IP or DNS: http://<EXTERNAL-IP>/
If you don't have an External IP (e.g., on local k8s), port-forward:
kubectl port-forward svc/nodejs-service 8080:80
# then open http://localhost:8080

5) Flow summary (text)

Developer pushes code → build & dockerize (Dockerfile)
Docker image pushed to ECR
Jenkins (or manual) updates Deployment image tag or uses kubectl set image
Kubernetes (EKS) pulls image from ECR and starts new pods (Deployment rolling update)
App connects to MariaDB StatefulSet service — persistent storage via PVC
Nginx LoadBalancer exposes the app to the internet
(You can use the diagram image at /mnt/data/A_flowchart_diagram_illustrates_a_continuous_integ.png as a visual aid.)

6) Notes & Best Practices

Secrets: store DB creds in Secrets (we used stringData for convenience). In production consider AWS Secrets Manager + External Secrets for rotation.

ImagePullSecrets: if your ECR repo requires auth in pod spec (private), ensure imagePullSecrets is set for the service account or cluster. EKS worker nodes with correct IAM and kubelet can pull from ECR if configured.

Backups: regularly snapshot EBS volumes for DB. Use managed RDS for simpler HA.

Scaling: use HPA for the app deployment. MariaDB requires careful scaling — consider primary/replica or use Amazon RDS/Aurora for production HA.

Health checks: add Liveness / Readiness probes to the Deployment spec for robust rolling updates.
