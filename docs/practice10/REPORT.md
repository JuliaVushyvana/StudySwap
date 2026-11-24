# Практична 10. Kubernetes, практична частина — на StudySwap

Лабораторну виконано не на тестовому сервісі [vivalafit/k8s-demo](https://github.com/vivalafit/k8s-demo), а на бекенді нашого проєкту StudySwap (Express 5 + SQLite). Маніфести лежать у [`k8s/`](../../k8s/) у корені репозиторію.

Середовище: macOS (arm64), Docker Desktop 29.9.3, Node.js 24, kubectl 1.36.1, Minikube 1.39.0 (Kubernetes 1.37.0, runtime containerd).

## Що замінено порівняно з тестовим репозиторієм

| У k8s-demo | У StudySwap | Чому |
|---|---|---|
| `/api/status`, `/api/items`, `/api/slow`, `/api/error` | `/health`, `/materials`, `/materials/{id}`, `/auth/login`, `/notifications` | реальні ендпоінти проєкту |
| liveness `/healthz`, readiness `/ready` | liveness `tcpSocket :3000`, readiness `GET /health` | `/health` перевіряє і сервер, і базу; liveness на базу спричиняв би зайві рестарти |
| `APP_MODE` dev → prod | `RATE_LIMIT_MAX` 50 → 3 | у StudySwap немає `APP_MODE`; ліміт видно ззовні — відповідь `429` |
| `replicas: 2`, RollingUpdate | `replicas: 1`, `strategy: Recreate` | у файл SQLite одночасно може писати лише один процес |
| `secret.yaml` у git | `kubectl create secret` з випадковим `JWT_SECRET` | ключ підпису токенів не комітимо |
| — | PVC `studyswap-data` 1Gi | база й завантажені файли мають переживати перезапуск Pod-а |
| namespace `k8s-demo`, host `k8s-demo.local` | namespace `studyswap`, host `studyswap.local` | |

Маніфести:

| Файл | Що описує |
|---|---|
| `k8s/namespace.yaml` | Namespace `studyswap` |
| `k8s/configmap.yaml` | ConfigMap `studyswap-config`: `PORT`, `DB_FILE`, `FILES_DIR`, `RATE_LIMIT_MAX`, `REQUEST_TIMEOUT_MS` |
| `k8s/pvc.yaml` | PVC `studyswap-data` 1Gi, `ReadWriteOnce` |
| `k8s/deployment.yaml` | Deployment `studyswap-api`: 1 репліка, `Recreate`, probes, ліміти ресурсів, том `/app/data` |
| `k8s/service.yaml` | Service `studyswap-api` типу ClusterIP: `80 → 3000` |
| `k8s/ingress.yaml` | Ingress `studyswap-ingress`: `studyswap.local` → `studyswap-api:80` |

---

## 60 балів

### 1. Локальний запуск

Бекенд запущено з тимчасовою базою, щоб не чіпати робочу `backend/data.db`; під час першого старту `seed.js` заповнює її тестовими даними.

```bash
cd backend && npm install
PORT=3005 DB_FILE=/tmp/lab10.db npm start
```

```
Server running on http://localhost:3005
```

Шість ендпоінтів:

```
$ curl -s http://localhost:3005/health
{"status":"ok","checks":{"database":"ok"}}
$ curl -s "http://localhost:3005/materials?page=1" | jq -c "{total, page, degraded, titles: [.items[].title]}"
{"total":3,"page":1,"degraded":false,"titles":["Нормалізація БД","Принципи ООП","Приклади екзаменаційних питань з БД"]}
$ curl -s "http://localhost:3005/materials?q=ооп" | jq -c "{total, titles: [.items[].title]}"
{"total":1,"titles":["Принципи ООП"]}
$ curl -s http://localhost:3005/materials/1 | jq -c "{id, title, subject, course, type}"
{"id":1,"title":"Нормалізація БД","subject":"Бази даних","course":2,"type":"конспект"}
$ TOKEN=$(curl -s -X POST http://localhost:3005/auth/login -H "Content-Type: application/json" -d '{"login":"anna_k","password":"studyswap123"}' | jq -r .accessToken)
{"tokenType":"Bearer","expiresIn":3600,"user":"Anna","role":"user"}
$ curl -s http://localhost:3005/notifications -H "Authorization: Bearer $TOKEN"
{"items":[],"unread":0}
$ curl -s -w " → %{http_code}\n" "http://localhost:3005/materials?course=7"
{"error":"ValidationError","code":"COURSE_OUT_OF_RANGE","details":[{"field":"course","message":"Курс — ціле число від 1 до 6"}],"requestId":"…"} → 400
```

### 2. Контейнеризація

Образ збирається з наявного `backend/Dockerfile`: двоетапна збірка на `node:22-bookworm-slim` (на першому етапі компілюється `better-sqlite3`, у робочий образ потрапляють лише `node_modules` і код), `HEALTHCHECK` на `/health`.

```bash
docker build -t studyswap-api:1.0.0 ./backend
```

```
$ docker images studyswap-api:1.0.0
REPOSITORY      TAG       IMAGE ID       SIZE
studyswap-api   1.0.0     ac951d66bc97   480MB
$ docker run -d --name studyswap-test -p 3000:3000 studyswap-api:1.0.0
190a57b70d01
$ curl -i http://localhost:3000/health
HTTP/1.1 200 OK
X-Powered-By: Express
X-Request-Id: …
Access-Control-Allow-Origin: *
Access-Control-Expose-Headers: X-Request-Id,Retry-After
Content-Type: application/json; charset=utf-8
Content-Length: 42

{"status":"ok","checks":{"database":"ok"}}

$ docker ps --filter name=studyswap-test --format "{{.Names}}  {{.Status}}"
studyswap-test  Up 16 seconds (healthy)
$ docker rm -f studyswap-test
studyswap-test
```

`(healthy)` — це результат `HEALTHCHECK` з Dockerfile.

### 3. Minikube і контекст kubectl

```bash
minikube start --driver=docker --memory=3072
```

Docker Desktop має ~4 ГБ пам'яті, тому `--memory=4096` не вмістився б; 3 ГБ достатньо.

Minikube має власний runtime (containerd) і не бачить образів Docker Desktop, а в Docker Hub образу `studyswap-api` немає, тому образ завантажено в кластер, а в Deployment стоїть `imagePullPolicy: IfNotPresent`.

```
$ minikube status
minikube
type: Control Plane
host: Running
kubelet: Running
apiserver: Running
kubeconfig: Configured

$ kubectl config current-context
minikube
$ kubectl get nodes
NAME       STATUS   ROLES           AGE   VERSION
minikube   Ready    control-plane   8h    v1.37.0
$ minikube image load studyswap-api:1.0.0
$ minikube image ls | grep studyswap
docker.io/library/studyswap-api:1.0.0
```

### 4. Namespace, Secret, ConfigMap, PVC, Deployment, Service

```
$ kubectl apply -f k8s/namespace.yaml
namespace/studyswap created
$ kubectl create secret generic studyswap-secret -n studyswap --from-literal=JWT_SECRET="$(openssl rand -hex 32)"
secret/studyswap-secret created
$ kubectl apply -f k8s/configmap.yaml -f k8s/pvc.yaml -f k8s/deployment.yaml -f k8s/service.yaml
configmap/studyswap-config created
persistentvolumeclaim/studyswap-data created
deployment.apps/studyswap-api created
service/studyswap-api created
$ kubectl rollout status deployment/studyswap-api -n studyswap
Waiting for deployment "studyswap-api" rollout to finish: 0 of 1 updated replicas are available...
deployment "studyswap-api" successfully rolled out
$ kubectl get all -n studyswap
NAME                                READY   STATUS    RESTARTS   AGE
pod/studyswap-api-6cd555d9b-knx7p   1/1     Running   0          6s

NAME                    TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)   AGE
service/studyswap-api   ClusterIP   10.107.34.91   <none>        80/TCP    6s

NAME                            READY   UP-TO-DATE   AVAILABLE   AGE
deployment.apps/studyswap-api   1/1     1            1           6s

NAME                                      DESIRED   CURRENT   READY   AGE
replicaset.apps/studyswap-api-6cd555d9b   1         1         1       6s
$ kubectl get pvc -n studyswap
NAME             STATUS   VOLUME                                     CAPACITY   ACCESS MODES   STORAGECLASS   VOLUMEATTRIBUTESCLASS   AGE
studyswap-data   Bound    pvc-a529017d-c4ce-486c-9ee5-1830745d688b   1Gi        RWO            standard       <unset>                 6s
$ kubectl get endpointslices -n studyswap
NAME                  ADDRESSTYPE   PORTS   ENDPOINTS    AGE
studyswap-api-6vqp7   IPv4          3000    10.244.0.6   6s
$ kubectl get secret studyswap-secret -n studyswap
NAME               TYPE     DATA   AGE
studyswap-secret   Opaque   1      6s
$ kubectl logs deploy/studyswap-api -n studyswap
Server running on http://localhost:3000
```

- PVC `Bound`: том створив стандартний `storage-provisioner` Minikube.
- Service знайшов Pod за selector-ом `app=studyswap-api` — в EndpointSlice адреса Pod-а `10.244.0.6:3000`.
- Secret показує лише кількість ключів (`DATA 1`), не значення.

### 5. Доступ через Service і port-forward

```
$ kubectl port-forward svc/studyswap-api 8080:80 -n studyswap
Forwarding from 127.0.0.1:8080 -> 3000
Forwarding from [::1]:8080 -> 3000
$ curl -s http://localhost:8080/health
{"status":"ok","checks":{"database":"ok"}}
$ curl -s "http://localhost:8080/materials?page=1" | jq -c "{total, page, degraded, titles: [.items[].title]}"
{"total":3,"page":1,"degraded":false,"titles":["Нормалізація БД","Принципи ООП","Приклади екзаменаційних питань з БД"]}
$ curl -s -X POST http://localhost:8080/auth/login -H "Content-Type: application/json" -d '{"login":"admin1","password":"studyswap123"}' | jq -c "{tokenType, user: .user.nickname, role: .user.role}"
{"tokenType":"Bearer","user":"Admin","role":"admin"}
$ curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/materials/999
404
```

Шлях запиту: `localhost:8080` → kubectl → API-сервер → kubelet → Pod `:3000`. Service тут лише вибирає Pod і перекладає порт `80 → 3000`.

---

## 75 балів

### 1. Зміна ConfigMap без рестарту Pod-а

```
$ kubectl get configmap studyswap-config -n studyswap -o jsonpath="{.data.RATE_LIMIT_MAX}"
50
$ kubectl exec deploy/studyswap-api -n studyswap -- printenv RATE_LIMIT_MAX
50
$ for i in 1 2 3 4 5; do curl -s -o /dev/null -w "%{http_code} " http://localhost:8080/materials; done
200 200 200 200 200 

# у k8s/configmap.yaml: RATE_LIMIT_MAX: "50" → "3"
$ grep RATE_LIMIT_MAX k8s/configmap.yaml
  RATE_LIMIT_MAX: "3"                 # запитів з одного IP за вікно 10 с
$ kubectl apply -f k8s/configmap.yaml
configmap/studyswap-config configured
$ kubectl get configmap studyswap-config -n studyswap -o jsonpath="{.data.RATE_LIMIT_MAX}"
3
$ kubectl exec deploy/studyswap-api -n studyswap -- printenv RATE_LIMIT_MAX
50
$ kubectl get pods -n studyswap
NAME                            READY   STATUS    RESTARTS   AGE
studyswap-api-6cd555d9b-knx7p   1/1     Running   0          35s
```

Після `kubectl apply` ConfigMap у кластері вже має `3`, але Pod досі бачить `50`: env-змінні копіюються в процес лише під час старту контейнера.

### 2. Rollout restart і нова конфігурація

```
$ kubectl rollout restart deployment/studyswap-api -n studyswap
deployment.apps/studyswap-api restarted
$ kubectl rollout status deployment/studyswap-api -n studyswap
Waiting for deployment "studyswap-api" rollout to finish: 0 out of 1 new replicas have been updated...
Waiting for deployment "studyswap-api" rollout to finish: 0 out of 1 new replicas have been updated...
Waiting for deployment "studyswap-api" rollout to finish: 0 out of 1 new replicas have been updated...
Waiting for deployment "studyswap-api" rollout to finish: 0 of 1 updated replicas are available...
deployment "studyswap-api" successfully rolled out
# rollout тривав 16 с
$ kubectl get pods -n studyswap
NAME                             READY   STATUS    RESTARTS   AGE
studyswap-api-76cf48f5d4-hrftc   1/1     Running   0          5s
$ kubectl exec deploy/studyswap-api -n studyswap -- printenv RATE_LIMIT_MAX
3
```

Як змінювався Pod (`kubectl get pods -w --output-watch-events`):

```
EVENT      NAME                            READY   STATUS    RESTARTS   AGE
ADDED      studyswap-api-6cd555d9b-knx7p   1/1     Running   0          44s
MODIFIED   studyswap-api-6cd555d9b-knx7p   1/1     Terminating   0          46s
MODIFIED   studyswap-api-6cd555d9b-knx7p   1/1     Terminating   0          46s
MODIFIED   studyswap-api-6cd555d9b-knx7p   0/1     Error         0          56s
ADDED      studyswap-api-76cf48f5d4-hrftc   0/1     Pending       0          0s
MODIFIED   studyswap-api-76cf48f5d4-hrftc   0/1     Pending       0          0s
MODIFIED   studyswap-api-76cf48f5d4-hrftc   0/1     ContainerCreating   0          0s
MODIFIED   studyswap-api-76cf48f5d4-hrftc   0/1     ContainerCreating   0          0s
MODIFIED   studyswap-api-76cf48f5d4-hrftc   0/1     Running             0          0s
MODIFIED   studyswap-api-6cd555d9b-knx7p    0/1     Error               0          56s
DELETED    studyswap-api-6cd555d9b-knx7p    0/1     Error               0          56s
MODIFIED   studyswap-api-76cf48f5d4-hrftc   1/1     Running             0          5s
MODIFIED   studyswap-api-76cf48f5d4-hrftc   1/1     Running             0          5s
```

Перевірка нового ліміту:

```
$ for i in 1 2 3 4 5; do curl -s -o /dev/null -w "%{http_code} " http://localhost:8080/materials; done
200 200 200 429 429 
$ curl -s -i http://localhost:8080/materials | grep -E "^HTTP|Retry-After"; curl -s http://localhost:8080/materials | jq -c "{error, code}"
HTTP/1.1 429 Too Many Requests
Retry-After: 10
{"error":"TooManyRequests","code":"RATE_LIMITED"}
```

Три запити пройшли, четвертий і п'ятий отримали `429` із заголовком `Retry-After: 10` — так StudySwap поводиться за перевищення ліміту.

Після перевірки повернуто `RATE_LIMIT_MAX: "50"` (`kubectl apply` + `rollout restart`); у git — файл зі значенням 50.

#### Знахідка: 10 секунд без жодного Pod-а

У вікні `watch` видно, що старий Pod 10 с був у `Terminating` (вік 46 → 56 с), потім перейшов у `Error`, і лише після цього з'явився новий. Причин дві:

1. `strategy: Recreate` спершу повністю зупиняє старий Pod — так задумано, щоб два процеси не писали в одну базу SQLite.
2. `server.js` не обробляє SIGTERM, а Node.js як PID 1 його ігнорує. Kubelet чекає `terminationGracePeriodSeconds` (у нас 10 с замість стандартних 30) і вбиває процес SIGKILL — звідси `Error`.

Разом це ~15 с недоступності API на кожному rollout. Виправлення для проєкту — обробник `process.on('SIGTERM', () => server.close(...))` у `server.js`: процес завершиться за долі секунди, і простій скоротиться до часу старту нового Pod-а (~5 с).

### 3. Liveness і readiness

```
$ kubectl describe pod -n studyswap -l app=studyswap-api
Name:             studyswap-api-76cf48f5d4-hrftc
Status:           Running
    Restart Count:  0
    Liveness:   tcp-socket :3000 delay=10s timeout=1s period=10s #success=1 #failure=3
    Readiness:  http-get http://:3000/health delay=3s timeout=1s period=5s #success=1 #failure=3
    Environment Variables from:
      studyswap-config  ConfigMap  Optional: false
      studyswap-secret  Secret     Optional: false
    Mounts:
      /app/data from data (rw)
  Ready                       True 
  ContainersReady             True 
    ClaimName:  studyswap-data
```

- **Readiness** — `GET /health` кожні 5 с. У вікні `watch` новий Pod спершу `0/1 Running` і стає `1/1` лише після першої успішної перевірки; до того Service не надсилає йому запитів.
- **Liveness** — лише чи процес слухає порт 3000. Якби liveness теж ходив у `/health`, недоступна база (а `/health` тоді віддає 503) спричиняла б нескінченні рестарти здорового контейнера.
- У `describe` також видно, що env узято з ConfigMap і Secret, а `/app/data` змонтовано з PVC `studyswap-data`.

---

## 90 балів

### 1. Ingress і `studyswap.local`

Надбудову ingress-nginx увімкнено командою `minikube addons enable ingress`.

```
$ kubectl apply -f k8s/ingress.yaml
ingress.networking.k8s.io/studyswap-ingress created
$ kubectl get ingress -n studyswap
NAME                CLASS   HOSTS             ADDRESS        PORTS   AGE
studyswap-ingress   nginx   studyswap.local   192.168.49.2   80      26s
$ kubectl describe ingress studyswap-ingress -n studyswap
Rules:
  Host             Path  Backends
  ----             ----  --------
  studyswap.local  
                   /   studyswap-api:80 (10.244.0.8:3000)
```

На macOS із драйвером docker адреса `192.168.49.2` недоступна з хоста напряму. Стандартний шлях — `minikube tunnel` (потребує `sudo`) і рядок `127.0.0.1 studyswap.local` у `/etc/hosts`. Тут замість тунелю використано port-forward до контролера ingress-nginx, а ім'я хоста передано заголовком `Host` — для nginx це той самий запит, що й через тунель:

```
$ kubectl port-forward -n ingress-nginx svc/ingress-nginx-controller 8088:80
Forwarding from 127.0.0.1:8088 -> 80
$ curl -s -H "Host: studyswap.local" http://localhost:8088/health
{"status":"ok","checks":{"database":"ok"}}
$ curl -s -H "Host: studyswap.local" "http://localhost:8088/materials?q=бд" | jq -c "{total, titles: [.items[].title]}"
{"total":2,"titles":["Нормалізація БД","Приклади екзаменаційних питань з БД"]}
$ curl -s -i -H "Host: studyswap.local" http://localhost:8088/health | grep -E "^HTTP|^X-Request-Id"
HTTP/1.1 200 OK
X-Request-Id: …
# інший Host — правило Ingress не збігається, відповідає сам nginx
$ curl -s -o /dev/null -w "%{http_code}\n" -H "Host: other.local" http://localhost:8088/health
404
$ kubectl logs -n ingress-nginx deploy/ingress-nginx-controller --tail=4 | grep studyswap
127.0.0.1 - - [24/Nov/2026:21:45:08 +0000] "GET /health HTTP/1.1" 200 42 "-" "curl/8.7.1" 84 0.003 [studyswap-studyswap-api-80] [] 10.244.0.8:3000 42 0.003 200
127.0.0.1 - - [24/Nov/2026:21:45:08 +0000] "GET /materials?q=%D0%B1%D0%B4 HTTP/1.1" 200 1040 "-" "curl/8.7.1" 102 0.007 [studyswap-studyswap-api-80] [] 10.244.0.8:3000 1040 0.007 200
127.0.0.1 - - [24/Nov/2026:21:45:08 +0000] "GET /health HTTP/1.1" 200 42 "-" "curl/8.7.1" 84 0.001 [studyswap-studyswap-api-80] [] 10.244.0.8:3000 42 0.002 200
```

Ingress маршрутизує за іменем хоста: з `Host: studyswap.local` запит дійшов до Pod-а (у лозі nginx upstream `studyswap-studyswap-api-80` → `10.244.0.8:3000`), з `Host: other.local` правило не збіглося — `404` від самого nginx.

Шлях запиту:

```
studyswap.local → /etc/hosts 127.0.0.1 → minikube tunnel (тут: port-forward 8088 → ingress-nginx :80)
  → Ingress studyswap-ingress (Host studyswap.local, path /) → Service studyswap-api:80 → Pod :3000
```

### 2. Debug-флоу

Порядок пошуку проблеми: Pod (чи запущений, що в подіях і логах) → Service (чи є endpoints) → Ingress (чи прив'язано правило й адресу).

```
# Pod
$ kubectl get pods -n studyswap -o wide
NAME                            READY   STATUS    RESTARTS   AGE   IP           NODE       NOMINATED NODE   READINESS GATES
studyswap-api-d997b6bf7-6qqbf   1/1     Running   0          79s   10.244.0.8   minikube   <none>           <none>
$ kubectl describe pod -n studyswap -l app=studyswap-api | sed -n "/^Events/,\$p"
Events:
  Type    Reason     Age   From               Message
  ----    ------     ----  ----               -------
  Normal  Scheduled  79s   default-scheduler  Successfully assigned studyswap/studyswap-api-d997b6bf7-6qqbf to minikube
  Normal  Pulled     78s   kubelet            spec.containers{studyswap-api}: Container image "studyswap-api:1.0.0" already present on machine and can be accessed by the pod
  Normal  Created    78s   kubelet            spec.containers{studyswap-api}: Container created
  Normal  Started    78s   kubelet            spec.containers{studyswap-api}: Container started
$ kubectl logs deploy/studyswap-api -n studyswap --tail=5
Server running on http://localhost:3000
$ kubectl exec deploy/studyswap-api -n studyswap -- ls -la /app/data
total 108
drwxrwxrwx 3 root root  4096 Nov 24 21:42 .
drwxr-xr-x 1 root root  4096 Nov 24 21:40 ..
drwxr-xr-x 2 root root  4096 Nov 24 21:42 files
-rw-r--r-- 1 root root 94208 Nov 24 21:42 studyswap.db

# Service
$ kubectl get svc,endpointslices -n studyswap
NAME                    TYPE        CLUSTER-IP     EXTERNAL-IP   PORT(S)   AGE
service/studyswap-api   ClusterIP   10.107.34.91   <none>        80/TCP    2m58s

NAME                                                 ADDRESSTYPE   PORTS   ENDPOINTS    AGE
endpointslice.discovery.k8s.io/studyswap-api-6vqp7   IPv4          3000    10.244.0.8   2m58s
$ kubectl run curl-test -n studyswap --rm -i --restart=Never --image=curlimages/curl -- -s http://studyswap-api.studyswap.svc/health
{"status":"ok","checks":{"database":"ok"}}

# Ingress
$ kubectl get ingress -n studyswap
NAME                CLASS   HOSTS             ADDRESS        PORTS   AGE
studyswap-ingress   nginx   studyswap.local   192.168.49.2   80      70s
$ kubectl get events -n studyswap --field-selector involvedObject.kind=Ingress
LAST SEEN   TYPE     REASON   OBJECT                      MESSAGE
47s         Normal   Sync     ingress/studyswap-ingress   Scheduled for sync
```

- **Pod:** `Events` без попереджень, у логах рядок старту сервера; через `exec` видно базу `studyswap.db` і каталог `files` на томі.
- **Service:** EndpointSlice містить IP Pod-а; тимчасовий Pod `curl-test` усередині кластера дістався до API за DNS-ім'ям `studyswap-api.studyswap.svc`.
- **Ingress:** має клас `nginx` і адресу; подія `Sync` означає, що контролер підхопив правило.

Якби Service не мав endpoints — першим ділом звіряти `selector` Service з мітками Pod-а; якби Ingress віддавав 503 — перевіряти readiness Pod-а.

### 3. Самовідновлення Pod-а і збереження даних

Перед видаленням Pod-а створено коментар — він зберігається в SQLite на томі PVC.

```
# 1) створюємо коментар — запис у SQLite на томі PVC
$ curl -s -H "Host: studyswap.local" -X POST http://localhost:8088/materials/1/comments -H "Authorization: Bearer $TOKEN" -H "Idempotency-Key: lab10-pvc-check" -H "Content-Type: application/json" -d '{"text":"Перевірка PVC: коментар має пережити видалення Pod-а"}' | jq -c "{id, author: .authorNickname, text}"
{"id":1,"author":"Julia","text":"Перевірка PVC: коментар має пережити видалення Pod-а"}
$ curl -s -H "Host: studyswap.local" http://localhost:8088/materials/1/comments | jq -c "[.items[].text]"
["Перевірка PVC: коментар має пережити видалення Pod-а"]

# 2) видаляємо Pod
$ kubectl delete pod studyswap-api-d997b6bf7-6qqbf -n studyswap
pod "studyswap-api-d997b6bf7-6qqbf" deleted from studyswap namespace
# delete тривав 10 с
$ kubectl get pods -n studyswap
NAME                            READY   STATUS    RESTARTS   AGE
studyswap-api-d997b6bf7-dqlvh   1/1     Running   0          10s
# новий Pod Ready через 10 с після delete
$ kubectl get pods -n studyswap
NAME                            READY   STATUS    RESTARTS   AGE
studyswap-api-d997b6bf7-dqlvh   1/1     Running   0          10s
$ kubectl get events -n studyswap --sort-by=.lastTimestamp | grep -E "Killing|SuccessfulCreate" | tail -2
10s         Normal   SuccessfulCreate        replicaset/studyswap-api-d997b6bf7     Created pod: studyswap-api-d997b6bf7-dqlvh
10s         Normal   Killing                 pod/studyswap-api-d997b6bf7-6qqbf      Stopping container studyswap-api

# 3) дані на місці
$ curl -s -H "Host: studyswap.local" http://localhost:8088/materials/1/comments | jq -c "[.items[].text]"
["Перевірка PVC: коментар має пережити видалення Pod-а"]
```

- ReplicaSet помітив, що Pod-ів менше, ніж `replicas: 1`, і одразу створив новий; через ~10 с він уже `1/1`, а Ingress сам переключився на нову адресу Pod-а.
- Коментар на місці: база лежить на PVC, а не у файловій системі контейнера.

#### Знахідка: `delete pod` обходить `Recreate`

Стратегія `Recreate` діє лише під час rollout. Коли Pod видалено вручну, ReplicaSet створює заміну одразу, не чекаючи завершення старого: події `SuccessfulCreate` і `Killing` мають однаковий час, а `delete` тривав 10 с (той самий SIGTERM). Ці 10 с два процеси мали відкритий той самий файл SQLite. На одному вузлі SQLite захищається файловими блокуваннями, тож даних не зіпсовано, але це ще одна причина додати обробку SIGTERM.

---

## 100 балів: власний сервіс

Уся лабораторна виконана на власному сервісі, тому окремої міграції демо-сервісу не знадобилося. Що довелося врахувати, переносячи StudySwap у Kubernetes:

- **Стан у SQLite** → PVC `ReadWriteOnce`, одна репліка і `Recreate`. Горизонтально масштабувати бекенд можна буде лише після переходу на окрему СКБД або виділення запису в окремий сервіс.
- **Секрет** `JWT_SECRET` → Secret, створений командою з випадковим значенням; без нього бекенд узяв би небезпечне значення за замовчуванням із `config.js`.
- **Образ** не опубліковано в реєстрі → `minikube image load` + `imagePullPolicy: IfNotPresent`. Для справжнього кластера образ треба публікувати (у проєкті є GHCR).
- **Health-check-и** → readiness на `/health`, liveness на TCP-порт.
- **Завершення роботи** → `terminationGracePeriodSeconds: 10` як тимчасовий обхід відсутньої обробки SIGTERM.

Поза кластером лишився фронтенд: `frontend/app.js` звертається до API за жорстко заданою адресою `http://localhost:3000`, тож для розгортання фронтенду в Kubernetes спершу треба зробити адресу API налаштовуваною.

---

## Контрольні запитання

**a. ConfigMap vs Secret.** Обидва — пари ключ-значення, які підключаються в Pod як env (`envFrom`, `valueFrom`) або як файли в томі. ConfigMap — для неконфіденційних налаштувань (у нас `RATE_LIMIT_MAX`, `DB_FILE`), зберігається відкритим текстом. Secret — для паролів, токенів і ключів (у нас `JWT_SECRET`): значення зберігаються в base64 — це кодування, а не шифрування, — але API-сервер обробляє їх окремо: доступ обмежується через RBAC, в etcd можна ввімкнути шифрування, `kubectl describe` і `get` не показують значень, а в томі Secret монтується в tmpfs. Тому ми не комітимо Secret у git, а створюємо командою.

**b. Liveness vs readiness.** Liveness перевіряє, чи процес живий; провал → kubelet перезапускає контейнер. Readiness перевіряє, чи Pod готовий приймати запити; провал → Pod прибирається з endpoints Service без перезапуску. У StudySwap liveness — TCP-порт 3000, readiness — `GET /health` (сервер + база). Якщо база недоступна, Pod перестає отримувати трафік, але не перезапускається, а каталог ще й має власний режим деградації (`degraded: true`).

**c. Шлях запиту.**
- `kubectl port-forward svc/studyswap-api 8080:80`: `localhost:8080` → kubectl → API-сервер → kubelet → Pod `:3000`. Service використано лише щоб знайти Pod за selector-ом і перекласти порт; kube-proxy і балансування не задіяні.
- `http://studyswap.local`: `/etc/hosts` → `127.0.0.1` → `minikube tunnel` → контролер ingress-nginx → правило Ingress (Host `studyswap.local`, path `/`) → Service `studyswap-api:80` → Pod `:3000`.

**d. Оновлення конфігурації з env-змінних ConfigMap.** Env читаються лише під час старту контейнера, тому після `kubectl apply -f k8s/configmap.yaml` потрібен `kubectl rollout restart deployment/studyswap-api -n studyswap` і `kubectl rollout status` для контролю (крок 75.2). Надійніше автоматизувати: хеш ConfigMap в анотації шаблону Pod-а або нове ім'я ConfigMap на кожну версію (Kustomize `configMapGenerator`, Helm `checksum/config`), щоб зміна конфігурації сама запускала rollout і потрапляла в історію ревізій.

**e. Міграція власного сервісу.** Див. розділ «100 балів»: стан у SQLite (PVC, одна репліка, `Recreate`), секрет через Secret, локальний образ через `minikube image load`, health-check-и на `/health` і TCP, обхід відсутньої обробки SIGTERM.

---

## Очищення

```bash
kubectl delete namespace studyswap   # видаляє всі ресурси разом із PVC і даними
minikube stop
```
