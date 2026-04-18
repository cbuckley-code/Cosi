# Kubernetes Cosita

Runs kubectl against any Kubernetes cluster. Kubeconfig is written from secrets at startup.

## Auth
Secret required: `kubernetes/kubeconfig` — paste the full kubeconfig YAML content (use `\n` for newlines).

Get kubeconfig: `kubectl config view --raw` or download from your cloud provider's console.

## Useful commands

```
# Cluster overview
kubectl cluster-info
kubectl get nodes -o wide
kubectl top nodes

# Pods
kubectl get pods -A
kubectl get pods -n my-namespace -o wide
kubectl describe pod my-pod -n my-namespace
kubectl logs my-pod -n my-namespace --tail=100
kubectl logs my-pod -n my-namespace -c container-name --tail=50
kubectl exec -it my-pod -n my-namespace -- sh

# Deployments
kubectl get deployments -A
kubectl describe deployment my-app -n prod
kubectl scale deployment my-app --replicas=3 -n prod
kubectl rollout status deployment my-app -n prod
kubectl rollout history deployment my-app -n prod
kubectl rollout undo deployment my-app -n prod

# Services & Ingresses
kubectl get svc -A
kubectl get ingress -A

# ConfigMaps & Secrets
kubectl get configmaps -n my-namespace
kubectl get secrets -n my-namespace

# Events (great for debugging)
kubectl get events --sort-by=.lastTimestamp -A
kubectl get events -n my-namespace --sort-by=.lastTimestamp

# Apply manifests (use stdin field)
kubectl apply -f -      # pass YAML in the stdin field

# Namespaces
kubectl get namespaces
kubectl create namespace my-ns

# Resource usage
kubectl top pods -A
kubectl top pods -n my-namespace
```
