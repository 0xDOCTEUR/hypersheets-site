# Hypersheets — site statique

Dossier de publication officiel.

**Hébergement gratuit :** [DEPLOY-GITHUB-PAGES.md](DEPLOY-GITHUB-PAGES.md) (GitHub Pages + DNS Hostinger).  
**Alternative payante :** [DEPLOY-HOSTINGER.md](DEPLOY-HOSTINGER.md) (FTP / hébergement Hostinger).

| Fichier | Rôle |
|---------|------|
| `index.html` | Dashboard Hypersheets (build public) |
| `leaderboard.json` | Classement Trade XYZ |
| `.htaccess` | HTTPS + cache JSON (Apache) |

## Mise à jour du leaderboard (opérateur)

```bash
cd Downloads
py build_leaderboard_from_hydromancer.py --s3 -o leaderboard.json
```

Puis remplacer `leaderboard.json` sur le serveur et vider le cache navigateur (Ctrl+F5).

## URL de production

- Site : https://hypersheets.xyz/
- JSON : https://hypersheets.xyz/leaderboard.json
