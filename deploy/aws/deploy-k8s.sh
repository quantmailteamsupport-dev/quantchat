#!/bin/bash
# Kubernetes Deployment Script
# Usage: ./scripts/deploy-k8s.sh

set -e

echo "🚀 QuantChat Kubernetes Deployment"
echo "===================================="

# Check if kubectl is installed
if ! command -v kubectl &> /dev/null; then
  echo "❌ kubectl is not installed"
  exit 1
fi

# Check if kubeconfig is configured
if ! kubectl cluster-info &> /dev/null; then
  echo "❌ Kubernetes cluster not accessible"
  echo "Please configure kubeconfig"
  exit 1
fi

echo "📋 Applying Kubernetes manifests..."
kubectl apply -f k8s-deployment.yaml

echo "⏳ Waiting for deployments..."
kubectl rollout status deployment/quantchat-api -n quantchat --timeout=5m
kubectl rollout status statefulset/postgres -n quantchat --timeout=5m
kubectl rollout status deployment/redis -n quantchat --timeout=5m

echo "✅ All services deployed!"
echo ""
echo "Get service endpoints:"
echo "  kubectl get svc -n quantchat"
echo ""
echo "View logs:"
echo "  kubectl logs -f deployment/quantchat-api -n quantchat"
echo ""
echo "Scale deployment:"
echo "  kubectl scale deployment quantchat-api --replicas=5 -n quantchat"
