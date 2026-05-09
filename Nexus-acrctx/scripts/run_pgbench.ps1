# PowerShell script to run pgbench load test against the Prisma PostgreSQL instance
# Requires Docker to be installed and the environment variable DATABASE_URL set to a PostgreSQL connection string.
# Usage: ./run_pgbench.ps1

$ErrorActionPreference = 'Stop'

# Extract connection details from DATABASE_URL (postgres://user:pass@host:port/dbname)
if (-not $env:DATABASE_URL) {
    Write-Error "DATABASE_URL environment variable not set."
}

$uri = [System.Uri]$env:DATABASE_URL
$host = $uri.Host
$port = $uri.Port
$userInfo = $uri.UserInfo.Split(':')
$username = $userInfo[0]
$password = $userInfo[1]
$dbname = $uri.AbsolutePath.TrimStart('/')

# Pull postgres image if not present
docker pull postgres:15-alpine

# Run pgbench in a temporary container
$containerName = "pgbench_temp_$(Get-Random)"

# Create a temporary .pgpass file for authentication
$pgpass = "$host:$port:$dbname:$username:$password"
$pgpassPath = "$env:TEMP\.pgpass"
Set-Content -Path $pgpassPath -Value $pgpass -NoNewline
# Restrict permissions
icacls $pgpassPath /inheritance:r /grant:r "$($env:USERNAME):(R)"

# Execute pgbench
docker run --rm `
    -e PGPASSFILE=/tmp/.pgpass `
    -v $pgpassPath:/tmp/.pgpass `
    --name $containerName `
    postgres:15-alpine `
    bash -c "apk add --no-cache postgresql-client && pgbench -h $host -p $port -U $username -d $dbname -c 10 -j 2 -T 300"

# Clean up
Remove-Item $pgpassPath -Force

Write-Host "pgbench load test completed."
