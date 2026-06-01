# Hypersheets — hébergement Hostinger (payant)

> **Tu ne veux pas payer ?** Utilise **[DEPLOY-GITHUB-PAGES.md](DEPLOY-GITHUB-PAGES.md)** — GitHub Pages est gratuit ; Hostinger sert seulement pour le nom de domaine (DNS).

---

# Hypersheets — GitHub puis Hostinger FTP (hypersheets.xyz)

Le **code source** vit sur **GitHub** ; le **site** est servi par un **plan d’hébergement Hostinger** (payant).

**Domaine à utiliser :** `hypersheets.xyz` uniquement.  
(Ne pas utiliser `hypersignal.eu` ni `hypersignal-dashboard.xyz` pour ce projet.)

---

## Vue d’ensemble

```
HYPERSHEETS/Hypersheets dashboard.html  →  (tu modifies en local)
         ↓ copie + config prod
hypersheets-deploy/  →  push GitHub  →  déploiement Hostinger (FTP ou Git)
         ↓
https://hypersheets.xyz/
https://hypersheets.xyz/leaderboard.json
```

Fichiers publiés (racine du site) :

| Fichier | Rôle |
|---------|------|
| `index.html` | Dashboard |
| `leaderboard.json` | Classement |
| `.htaccess` | HTTPS + en-têtes JSON |

---

## Étape 0 — Hostinger : créer le site sur hypersheets.xyz

Sur ta capture, `hypersheets.xyz` propose **« + Create a website »** :

1. Clique **Create a website** (ou **Manage domain** → attacher à un hébergement existant).
2. Choisis **Empty PHP/HTML website** ou **Upload your files** (site statique).
3. Note l’**IP** de l’hébergement et le dossier web (souvent `public_html` ou `domains/hypersheets.xyz/public_html`).

Ensuite :

- **SSL** : hPanel → SSL → activer le certificat gratuit pour `hypersheets.xyz` et `www`.
- **DNS** : si le domaine est chez Hostinger, les enregistrements `@` et `www` sont en général créés automatiquement quand le site est créé.

---

## Étape 1 — Dépôt GitHub (une fois)

### A. Créer le repo sur GitHub

1. [github.com/new](https://github.com/new)
2. Nom : `hypersheets-site` (ou autre)
3. **Public** ou **Private** — les deux conviennent
4. **Ne pas** cocher « Add a README »
5. **Create repository**

### B. Envoyer le dossier `hypersheets-deploy`

**Avec GitHub Desktop (recommandé si `git` n’est pas dans le PATH) :**

1. **File → Add local repository** → dossier  
   `C:\Users\Monsi\Downloads\hypersheets-deploy`
2. Si demandé : **create a repository**
3. Summary : `Initial Hypersheets site`
4. **Commit to main** → **Publish repository** → choisis ton compte et le nom `hypersheets-site`

**Avec Git en ligne de commande** (si installé) :

```powershell
cd $env:USERPROFILE\Downloads\hypersheets-deploy
git init
git add index.html leaderboard.json .htaccess .github/workflows/deploy-hostinger.yml README.md .gitignore
git commit -m "Initial Hypersheets static site"
git branch -M main
git remote add origin https://github.com/VOTRE_COMPTE/hypersheets-site.git
git push -u origin main
```

---

## Étape 2 — Déployer sur Hostinger

### Option recommandée — GitHub Actions → FTP (comme souvent sur l’ancien projet)

À chaque `git push` sur `main`, GitHub envoie les fichiers vers `public_html`.

1. **hPanel** → **Fichiers** → **Comptes FTP** (ou **FTP Accounts**)
2. Crée ou note :
   - **Hôte** : souvent `ftp.hypersheets.xyz` ou l’hôte indiqué par Hostinger
   - **Utilisateur** / **Mot de passe**
   - Dossier distant : `/public_html/` (ou celui indiqué pour ce site)

3. Sur GitHub : repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret** :

   | Secret | Valeur |
   |--------|--------|
   | `FTP_HOST` | ex. `ftp.hypersheets.xyz` |
   | `FTP_USER` | ton utilisateur FTP |
   | `FTP_PASSWORD` | ton mot de passe FTP |

4. **Actions** → workflow **Deploy to Hostinger** → **Run workflow** (ou refais un push).

Le workflow est déjà dans `.github/workflows/deploy-hostinger.yml`.

### Option B — Git intégré Hostinger

Si ton offre a **hPanel → Advanced → Git** :

1. Clone l’URL HTTPS du repo GitHub
2. Branche `main`
3. Dossier de déploiement : `public_html`
4. **Deploy**

### Option C — Premier lancement manuel (test rapide)

hPanel → **File Manager** → `public_html` :

- Supprime `index.php` par défaut si présent
- Upload `index.html`, `leaderboard.json`, `.htaccess`

Puis configure GitHub + FTP pour les mises à jour suivantes.

---

## Étape 3 — Vérifier

- https://hypersheets.xyz/
- https://hypersheets.xyz/leaderboard.json  
- **Ctrl+F5** sur le dashboard
- Onglet **Classement** : données chargées, pas de 404 dans la console (F12)

---

## Mises à jour (routine)

1. Modifier `HYPERSHEETS/Hypersheets dashboard.html` en local.
2. Copier vers `hypersheets-deploy/index.html` et vérifier :
   - `appUrl` / `leaderboardDataUrl` → `https://hypersheets.xyz/...`
   - `showLeaderboardImport: false`
3. Régénérer le classement si besoin :
   ```powershell
   cd $env:USERPROFILE\Downloads
   py build_leaderboard_from_hydromancer.py --s3 -o leaderboard.json
   copy leaderboard.json hypersheets-deploy\leaderboard.json
   ```
4. **Commit + push** sur GitHub → déploiement auto (FTP) ou Git Hostinger.

---

## Dépannage

| Problème | Piste |
|----------|--------|
| Page Hostinger par défaut | `index.html` absent ou pas à la racine de `public_html` |
| Classement vide | `leaderboard.json` manquant ou mauvaise URL dans `HS_CONFIG` |
| Ancien nom / ancien domaine | Vérifier qu’on déploie bien `hypersheets-deploy`, pas un vieux zip HyperSignal |
| FTP Action en erreur | Vérifier les 3 secrets et le chemin `server-dir` (`/public_html/`) |
