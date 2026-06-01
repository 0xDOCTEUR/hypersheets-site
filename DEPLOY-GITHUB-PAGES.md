# Hypersheets — hébergement gratuit (GitHub Pages)

**0 € d’hébergement.** Tu paies seulement le **nom de domaine** chez Hostinger (`hypersheets.xyz`).  
Le site est servi par **GitHub Pages** ; Hostinger sert uniquement à pointer le DNS.

C’est le même principe que l’ancien projet HyperSignal sur GitHub, sans plan d’hébergement Hostinger.

---

## 1. Créer le repo GitHub

1. [github.com/new](https://github.com/new) → nom `hypersheets-site` (ou autre)
2. **Public** (Pages gratuit en public)
3. Sans README

**GitHub Desktop :**

1. **Add local repository** → `C:\Users\Monsi\Downloads\hypersheets-deploy`
2. Commit : `Initial Hypersheets site`
3. **Publish repository**

Fichiers importants dans le repo :

- `index.html`, `leaderboard.json`, `.htaccess` (optionnel sur Pages)
- `CNAME` → contient `hypersheets.xyz`
- `.github/workflows/github-pages.yml`

---

## 2. Activer GitHub Pages

1. Repo → **Settings** → **Pages**
2. **Build and deployment** → Source : **GitHub Actions**
3. Après le premier push sur `main`, l’onglet **Actions** doit afficher **Deploy GitHub Pages** en vert
4. Dans **Pages**, tu verras une URL du type `https://VOTRE_COMPTE.github.io/hypersheets-site/` (test)

---

## 3. Domaine personnalisé (Hostinger = DNS seulement)

**Ne clique pas** sur « Create a website » / hébergement payant sur Hostinger.  
Tu gardes le domaine ; tu modifies seulement la **zone DNS**.

hPanel → **Domaines** → **hypersheets.xyz** → **DNS / DNS Zone** :

### Enregistrement apex `@` (hypersheets.xyz)

Quatre enregistrements **A** (GitHub Pages) :

| Type | Nom | Valeur |
|------|-----|--------|
| A | @ | `185.199.108.153` |
| A | @ | `185.199.109.153` |
| A | @ | `185.199.110.153` |
| A | @ | `185.199.111.153` |

### Sous-domaine www (optionnel)

| Type | Nom | Valeur |
|------|-----|--------|
| CNAME | www | `VOTRE_COMPTE.github.io` |

(Remplace `VOTRE_COMPTE` par ton identifiant GitHub.)

### Sur GitHub

Repo → **Settings** → **Pages** → **Custom domain** → `hypersheets.xyz` → **Save**  
Coche **Enforce HTTPS** quand GitHub le propose (après propagation DNS, souvent 10–60 min).

Le fichier `CNAME` à la racine du repo doit contenir : `hypersheets.xyz`

---

## 4. Vérifications

- https://hypersheets.xyz/
- https://hypersheets.xyz/leaderboard.json
- **Ctrl+F5** sur le dashboard

`index.html` est déjà configuré avec :

- `appUrl: 'https://hypersheets.xyz/'`
- `leaderboardDataUrl: 'https://hypersheets.xyz/leaderboard.json'`

---

## Mises à jour

```powershell
cd $env:USERPROFILE\Downloads
# 1) Modifier HYPERSHEETS/Hypersheets dashboard.html
# 2) Copier vers hypersheets-deploy/index.html (config prod)
# 3) Optionnel : régénérer leaderboard.json
py build_leaderboard_from_hydromancer.py --s3 -o leaderboard.json
copy leaderboard.json hypersheets-deploy\leaderboard.json
```

Puis **commit + push** sur `main` → GitHub Actions republie en ~1–2 min.

---

## Coûts

| Poste | Coût |
|-------|------|
| GitHub Pages (repo public) | Gratuit |
| Hostinger hébergement web | **Pas nécessaire** |
| Domaine hypersheets.xyz | Renouvellement domaine uniquement |

---

## Dépannage

| Problème | Solution |
|----------|----------|
| Pages ne se build pas | Actions → voir les logs ; repo **public** |
| Domaine « not verified » | Attendre DNS ; vérifier les 4 A + `CNAME` dans le repo |
| 404 sur leaderboard.json | Fichier bien commité à la racine du repo |
| Ancien site Hostinger | Désactiver / ne pas créer de site web payant sur ce domaine |
