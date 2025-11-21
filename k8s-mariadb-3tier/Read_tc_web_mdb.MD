3-Tier Architecture (Tomcat Web + Tomcat App + MariaDB Database)

Layers:

Web Layer → NGINX (Ingress or Web Frontend)

Application Layer → Tomcat Server (serving Java WAR applications)

Database Layer → MariaDB Stateful DB (with Secrets + ConfigMap)

✅ 1. Tomcat Deployment (Application Layer)
tomcat-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: tomcat-app
spec:
  replicas: 2
  selector:
    matchLabels:
      app: tomcat-app
  template:
    metadata:
      labels:
        app: tomcat-app
    spec:
      containers:
      - name: tomcat
        image: tomcat:9-jdk11
        ports:
        - containerPort: 8080
        env:
        - name: DB_HOST
          valueFrom:
            configMapKeyRef:
              name: app-config
              key: db_host
        - name: DB_USER
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: username
        - name: DB_PASS
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: password

✅ 2. Tomcat Service
tomcat-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: tomcat-service
spec:
  type: ClusterIP
  selector:
    app: tomcat-app
  ports:
  - port: 8080
    targetPort: 8080

✅ 3. NGINX Web Layer (Ingress / Web Server)
ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web-ingress
  annotations:
    kubernetes.io/ingress.class: nginx
spec:
  rules:
  - host: tomcat.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: tomcat-service
            port:
              number: 8080

✅ 4. MariaDB Deployment (Database Layer)
mariadb-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: mariadb
spec:
  replicas: 1
  selector:
    matchLabels:
      app: mariadb
  template:
    metadata:
      labels:
        app: mariadb
    spec:
      containers:
      - name: mariadb
        image: mariadb:10.5
        ports:
        - containerPort: 3306
        env:
        - name: MYSQL_ROOT_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: password
        - name: MYSQL_USER
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: username
        - name: MYSQL_PASSWORD
          valueFrom:
            secretKeyRef:
              name: db-secret
              key: password
        - name: MYSQL_DATABASE
          value: healthdb

✅ 5. MariaDB Service
mariadb-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: mariadb-service
spec:
  type: ClusterIP
  selector:
    app: mariadb
  ports:
  - port: 3306
    targetPort: 3306

✅ 6. ConfigMap for Application
configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: app-config
data:
  db_host: "mariadb-service"

✅ 7. Secrets for MariaDB credentials
secret.yaml
apiVersion: v1
kind: Secret
metadata:
  name: db-secret
type: Opaque
data:
  username: YWRtaW4=      # base64: admin
  password: cGFzc3dvcmQ=  # base64: password


To generate base64:

echo -n "admin" | base64
echo -n "password" | base64

🧩 Flow of the Architecture
            ┌─────────────────────────┐
            │     Client Browser      │
            └───────────┬────────────┘
                        │
                        ▼
            ┌─────────────────────────┐
            │      Ingress (NGINX)    │
            └───────────┬────────────┘
                        │
                        ▼
            ┌─────────────────────────┐
            │   Tomcat Application    │
            │  (Java WAR Deployment)  │
            └───────────┬────────────┘
                        │
                        ▼
            ┌─────────────────────────┐
            │     MariaDB Database    │
            └─────────────────────────┘

🧪 Commands to Deploy on AWS EKS
1. Create Namespace (optional)
kubectl create ns tomcat-app

2. Apply all YAML files
kubectl apply -f secret.yaml
kubectl apply -f configmap.yaml
kubectl apply -f mariadb-deployment.yaml
kubectl apply -f mariadb-service.yaml
kubectl apply -f tomcat-deployment.yaml
kubectl apply -f tomcat-service.yaml
kubectl apply -f ingress.yaml

🌐 Accessing Tomcat from Local Browser
If using AWS LoadBalancer Ingress:
kubectl get ingress


You will get:

ADDRESS = a1b2c3d4.amazonaws.com


Open:

http://a1b2c3d4.amazonaws.com


Or if using domain:

http://tomcat.example.com
