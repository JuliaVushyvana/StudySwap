# Практична 10. Kubernetes, практична частина

Лабораторну виконано на власному проєкті: у Kubernetes розгорнуто бекенд StudySwap замість тестового сервісу [vivalafit/k8s-demo](https://github.com/vivalafit/k8s-demo).

- **Звіт:** [REPORT.md](REPORT.md) — кроки рівнів 60–100, виводи команд, відповіді на контрольні запитання.
- **Маніфести:** [`k8s/`](../../k8s/) — Namespace, ConfigMap, PVC, Deployment, Service, Ingress.

Попередня практика з теоретичною схемою StudySwap у Kubernetes — [docs/practice9](../practice9/).

## Запуск

```bash
minikube start --driver=docker --memory=3072
minikube addons enable ingress
docker build -t studyswap-api:1.0.0 ./backend
minikube image load studyswap-api:1.0.0

kubectl apply -f k8s/namespace.yaml
kubectl create secret generic studyswap-secret -n studyswap --from-literal=JWT_SECRET="$(openssl rand -hex 32)"
kubectl apply -f k8s/
kubectl rollout status deployment/studyswap-api -n studyswap

kubectl port-forward svc/studyswap-api 8080:80 -n studyswap   # http://localhost:8080/health
```

## Шлях запиту

```
port-forward:  localhost:8080 → kubectl → API-сервер → kubelet → Pod :3000
Ingress:       studyswap.local → /etc/hosts 127.0.0.1 → minikube tunnel → ingress-nginx
               → Ingress studyswap-ingress (Host studyswap.local, path /) → Service studyswap-api:80 → Pod :3000
```

## Що з'ясували по ходу

- **SQLite задає форму Deployment-а:** одна репліка, `strategy: Recreate` і PVC `ReadWriteOnce` — інакше два процеси писали б в один файл бази. Балансування між репліками, як у демо, для StudySwap неможливе.
- **Env з ConfigMap читаються лише під час старту контейнера.** Після `kubectl apply` Pod бачив старий `RATE_LIMIT_MAX=50`, після `kubectl rollout restart` — новий `3`, і четвертий запит отримав `429`.
- **~15 с без API на кожному rollout.** `Recreate` спершу зупиняє старий Pod, а `server.js` не обробляє SIGTERM, тож kubelet чекає `terminationGracePeriodSeconds` (10 с) і вбиває процес (`Error`). Виправлення — обробник SIGTERM із `server.close()` у `server.js`.
- **`kubectl delete pod` обходить `Recreate`:** ReplicaSet створює заміну одразу, тож ~10 с два процеси мають відкритий один файл SQLite.
- **Дані переживають заміну Pod-а:** коментар, створений до `kubectl delete pod`, був на місці після самовідновлення — база лежить на PVC.
- **Пам'ять Minikube.** `minikube start --memory=4096` не стартує, якщо Docker Desktop має менше 4 ГБ; кластер запущено з `--memory=3072`.

## Попередній варіант на тестовому сервісі

Спершу лабораторну виконано у fork-у [JuliaVushyvana/k8s-demo](https://github.com/JuliaVushyvana/k8s-demo) ([REPORT.md](https://github.com/JuliaVushyvana/k8s-demo/blob/main/REPORT.md)): рівні 60–90 — на демо-сервісі, рівень 100 — бекенд StudySwap у Kubernetes. Маніфести StudySwap у `k8s/` цього репозиторію виросли з маніфестів рівня 100.
