#!/usr/bin/env bash
# MODÈLE. N'effectue rien tant que les variables/ressources explicites ne sont pas définies.
set -euo pipefail
: "${IMAGE_SHA:?}" "${IMAGE_REPOSITORY:?}" "${NAMESPACE:?}" "${SMOKE_URL:?}" "${KUBE_CONFIG_DATA:?}"
[[ "$IMAGE_SHA" =~ ^[0-9a-f]{40}$ ]] || { echo 'SHA image invalide'; exit 1; }
export KUBECONFIG="${RUNNER_TEMP:?}/menu2kin-kubeconfig"
umask 077
printf '%s' "$KUBE_CONFIG_DATA" | base64 --decode > "$KUBECONFIG"
trap 'rm -f "$KUBECONFIG"' EXIT
image_ref="ghcr.io/$IMAGE_REPOSITORY:$IMAGE_SHA"
job_name="migrate-${IMAGE_SHA:0:12}-${GITHUB_RUN_ATTEMPT:-1}-${GITHUB_RUN_ID:-local}"
# CronJob suspendu existant contenant secret DATABASE_URL migration et service account minimum.
# Générer le Job localement permet de choisir l'image AVANT de démarrer son pod.
kubectl -n "$NAMESPACE" create job "$job_name" --from=cronjob/menu2kin-migration --dry-run=client -o json > "$RUNNER_TEMP/menu2kin-job.json"
python3 - "$RUNNER_TEMP/menu2kin-job.json" "$image_ref-migration" <<'PY'
import json, sys
p=sys.argv[1]
with open(p) as f: data=json.load(f)
containers=data['spec']['template']['spec']['containers']
assert len(containers)==1, 'Le Job migration doit avoir un conteneur unique'
containers[0]['image']=sys.argv[2]
with open(p,'w') as f: json.dump(data,f)
PY
kubectl -n "$NAMESPACE" apply -f "$RUNNER_TEMP/menu2kin-job.json"
kubectl -n "$NAMESPACE" wait --for=condition=complete --timeout=300s "job/$job_name"
kubectl -n "$NAMESPACE" set image deployment/menu2kin-api api="$image_ref"
kubectl -n "$NAMESPACE" set image deployment/menu2kin-worker worker="$image_ref"
kubectl -n "$NAMESPACE" rollout status deployment/menu2kin-api --timeout=180s
kubectl -n "$NAMESPACE" rollout status deployment/menu2kin-worker --timeout=180s
curl --fail --silent --show-error --max-time 10 "$SMOKE_URL/readiness"
