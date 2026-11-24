# Практична 10. Kubernetes, практична частина

Робота виконується у fork-у навчального репозиторію [vivalafit/k8s-demo](https://github.com/vivalafit/k8s-demo), як вимагає умова:

- **Fork:** https://github.com/JuliaVushyvana/k8s-demo
- **Звіт:** [REPORT.md](https://github.com/JuliaVushyvana/k8s-demo/blob/main/REPORT.md) — кроки, виводи команд, відповіді на контрольні запитання.

Попередня практика з теоретичною схемою StudySwap у Kubernetes — [docs/practice9](../practice9/).

## Розподіл

| Хто | Що зроблено |
|---|---|
| Розробник 1 | локальний запуск і 6 ендпоінтів, Docker-образ, Minikube, Namespace / ConfigMap / Secret / Deployment / Service, доступ через `kubectl port-forward` |
| Розробник 1 | `APP_MODE` dev → prod: після `kubectl apply` Pod досі бачить `dev`, після `kubectl rollout restart` — `prod`; liveness `/healthz` і readiness `/ready` через `kubectl describe pod` |
| Розробник 1 | Ingress на `k8s-demo.local` через `minikube tunnel`, debug-команди для Pod / Service / Ingress, самовідновлення Pod-а після `kubectl delete pod` |
| Розробник 2 | бекенд StudySwap у Kubernetes (Deployment + Service, ConfigMap) — окремий розділ у `REPORT.md` |

## Шлях запиту

```
port-forward:  localhost:8080 → kubectl → API-сервер → kubelet → Pod :8080
Ingress:       k8s-demo.local → /etc/hosts 127.0.0.1 → minikube tunnel → ingress-nginx
               → Ingress k8s-demo-ingress (Host k8s-demo.local, path /) → Service k8s-demo-api:80 → Pod :8080
```

Через `port-forward` усі запити йдуть в один Pod; через Ingress трафік розподіляється між репліками (у логах nginx відповідали Pod-и `10.244.0.12` і `10.244.0.7`).

## Що з'ясували по ходу

- **Пам'ять Minikube.** `minikube start --memory=4096` не стартує, якщо Docker Desktop має менше 4 ГБ; кластер запущено з `--memory=3072`.
- **Env з ConfigMap читаються лише під час старту контейнера.** Після зміни ConfigMap потрібен `kubectl rollout restart`; надійніше — хеш ConfigMap в анотації шаблону Pod-а, щоб rollout запускався сам.
- **`Error` у старих Pod-ів під час rollout.** Node.js як PID 1 ігнорує SIGTERM, тому kubelet чекає 30 с і вбиває процес SIGKILL (код 137). Висновок для StudySwap: образ бекенду запускає `node server.js`, а обробник SIGTERM є лише в `tracing.js` (режим `start:otel`), тому в Kubernetes у `server.js` треба обробляти SIGTERM (`server.close()`), інакше кожен rollout затягується на 30 с.
- **Readiness прибирає новий Pod з трафіку**, доки він не готовий: після `kubectl delete pod` заміна з'явилася за ~1 с, але `1/1` стала лише через ~12 с.
