param([string]$SshHost='scalaris-vps')
$ErrorActionPreference='Stop'
$projectRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$staging=Join-Path ([IO.Path]::GetTempPath()) ('burger-house-vps-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $staging | Out-Null
Push-Location $projectRoot
try {
  if (@(git status --porcelain).Count) { throw 'Guardar y verificar todos los cambios de fuente en Git antes de desplegar.' }
  $version=(git rev-parse HEAD).Trim()
  if ($LASTEXITCODE -or $version -notmatch '^[a-f0-9]{40}$') { throw 'No se pudo identificar el commit.' }
  $archive=Join-Path $staging 'source.tar.gz'
  git archive --format=tar.gz --output=$archive HEAD
  if ($LASTEXITCODE) { throw 'No se pudo preparar el paquete de la aplicacion.' }
  $entries=@(tar -tzf $archive)
  if ($LASTEXITCODE -or @($entries | Where-Object { $_ -match '(^|/)(data|\.private|\.vps-private|output)(/|$)|(^|/)\.env|(^|/)secrets\.json$' }).Count) { throw 'El paquete contiene una ruta privada o no pudo verificarse.' }
  $sshOptions=@('-o','BatchMode=yes','-o','ConnectTimeout=15','-o','ServerAliveInterval=10','-o','ServerAliveCountMax=3')
  ssh @sshOptions $SshHost "mkdir -p /srv/apps/burger-house/releases/$version"
  if ($LASTEXITCODE) { throw 'No se pudo acceder al VPS.' }
  scp @sshOptions $archive "${SshHost}:/srv/apps/burger-house/releases/$version/source.tar.gz"
  if ($LASTEXITCODE) { throw 'No se pudo subir el paquete.' }
  $remote=@'
set -eu
cd /srv/apps/burger-house
tar -xzf releases/__VERSION__/source.tar.gz -C releases/__VERSION__ deployment/vps/Deploy-Commit.sh
exec bash releases/__VERSION__/deployment/vps/Deploy-Commit.sh __VERSION__ --archive-ready
'@
  $remote=$remote.Replace('__VERSION__',$version).Replace("`r",'')
  $remote | ssh @sshOptions $SshHost 'sh -s'
  if ($LASTEXITCODE) { throw 'El despliegue no termino. Revisar los registros del VPS.' }
  Write-Host "Burger House desplegado desde el commit $version. Paquete conservado en $archive"
} finally { Pop-Location }
