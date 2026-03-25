{{/*
Expand the name of the chart.
*/}}
{{- define "cosi.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "cosi.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart label.
*/}}
{{- define "cosi.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Namespace — uses namespaceOverride if set, otherwise release namespace.
*/}}
{{- define "cosi.namespace" -}}
{{- default .Release.Namespace .Values.namespaceOverride }}
{{- end }}

{{/*
Common labels applied to all resources.
*/}}
{{- define "cosi.labels" -}}
helm.sh/chart: {{ include "cosi.chart" . }}
{{ include "cosi.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels.
*/}}
{{- define "cosi.selectorLabels" -}}
app.kubernetes.io/name: {{ include "cosi.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Component-specific selector labels.
*/}}
{{- define "cosi.componentLabels" -}}
{{ include "cosi.selectorLabels" . }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{/*
ServiceAccount name.
*/}}
{{- define "cosi.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "cosi.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Image helper — prepends global registry if set.
Usage: {{ include "cosi.image" (dict "image" .Values.orchestrator.image "global" .Values.global "appVersion" .Chart.AppVersion) }}
*/}}
{{- define "cosi.image" -}}
{{- $registry := .global.imageRegistry | default "" }}
{{- $repo := .image.repository }}
{{- $tag := .image.tag | default .appVersion }}
{{- if $registry }}
{{- printf "%s/%s:%s" $registry $repo $tag }}
{{- else }}
{{- printf "%s:%s" $repo $tag }}
{{- end }}
{{- end }}

{{/*
Image pull secrets.
*/}}
{{- define "cosi.imagePullSecrets" -}}
{{- with .Values.global.imagePullSecrets }}
imagePullSecrets:
  {{- range . }}
  - name: {{ . }}
  {{- end }}
{{- end }}
{{- end }}

{{/*
Redis URL — used by orchestrator.
*/}}
{{- define "cosi.redisUrl" -}}
{{- if .Values.redis.enabled }}
{{- printf "redis://%s-redis:%d" (include "cosi.fullname" .) (.Values.redis.service.port | int) }}
{{- else }}
{{- "redis://localhost:6379" }}
{{- end }}
{{- end }}
