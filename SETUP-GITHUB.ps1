# Hypersheets — connexion GitHub + publication (à lancer dans PowerShell)
$gh = "${env:ProgramFiles}\GitHub CLI\gh.exe"
$git = "${env:ProgramFiles}\Git\cmd\git.exe"

if (-not (Test-Path $gh)) { Write-Error "GitHub CLI introuvable. Ferme et rouvre PowerShell après winget install."; exit 1 }
if (-not (Test-Path $git)) { Write-Error "Git introuvable."; exit 1 }

# Rafraîchir PATH pour cette session
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" +
            [System.Environment]::GetEnvironmentVariable("Path", "User")

Write-Host "`n=== 1/3 Connexion GitHub (navigateur) ===" -ForegroundColor Cyan
Write-Host "Si tu n'es pas encore connecté, suis les questions (GitHub.com, HTTPS, Login with browser).`n"
& $gh auth login

$status = & $gh auth status 2>&1
if ($LASTEXITCODE -ne 0) { Write-Error "Connexion GitHub échouée."; exit 1 }

Write-Host "`n=== 2/3 Création du dépôt et push ===" -ForegroundColor Cyan
Set-Location $PSScriptRoot

if (-not (Test-Path .git)) {
  & $git init
  & $git branch -M main
}

& $git add index.html leaderboard.json CNAME .htaccess .github .gitignore README.md
& $git commit -m "Initial Hypersheets site (GitHub Pages)" 2>$null
if ($LASTEXITCODE -ne 0) {
  & $git add -A
  & $git commit -m "Initial Hypersheets site (GitHub Pages)"
}

$repoName = "hypersheets-site"
$exists = & $gh repo view $repoName 2>$null
if ($LASTEXITCODE -ne 0) {
  & $gh repo create $repoName --public --source=. --remote=origin --push --description "Hypersheets dashboard (static)"
} else {
  & $git push -u origin main
}

Write-Host "`n=== 3/3 Activer GitHub Pages ===" -ForegroundColor Cyan
$user = (& $gh api user -q .login)
Write-Host "Ouvre dans le navigateur :"
Write-Host "  https://github.com/$user/$repoName/settings/pages" -ForegroundColor Yellow
Write-Host "  → Build and deployment : GitHub Actions"
Write-Host "  → Custom domain : hypersheets.xyz (après DNS Hostinger)"
Write-Host "`nRepo : https://github.com/$user/$repoName" -ForegroundColor Green
