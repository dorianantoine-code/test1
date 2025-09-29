cd "/Users/dorianantoine/Library/CloudStorage/GoogleDrive-dorianantoine@gmail.com/Mon Drive/dev/test1"

token git : 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

# 1) Voir ce qui a changé (optionnel)

git status

# 2) Ajouter TOUTES les modifs (y compris les nouveaux fichiers)

git add -A

# 3) Commit avec un message parlant
git add -A
git commit -m "feat(agenda): semaine en cours par défaut + rendu visuel EDT; fix: extraction id élève"
git pull --rebase origin main
git pull --rebase origin main
git push origin main
# 4) Se resynchroniser proprement si le remote a avancé

git pull --rebase origin main

# 5) Pousser

git push origin main

export ED_DEBUG=1
NEXT_DISABLE_TURBOPACK=1 pnpm dev

1. Installation des dépendances
   Après avoir cloné ou déplacé ton projet :

pnpm install
🚀 2. Lancer le serveur de développement
pnpm dev
Accès local : http://localhost:3000

Pour l'arrêter : Ctrl + C

🏗️ 3. Compiler (build) l'application en mode production
pnpm build
Génère le dossier out/ (si tu utilises output: 'export' dans next.config.ts)

🌐 4. Lancer un serveur statique local (optionnel pour tester out/)
pnpm add serve -D
npx serve out
Utile pour simuler un déploiement local statique (sur http://localhost:3000)

🔌 5. Capacitor (build mobile)
Préparation Capacitor :

pnpm build # build Next.js
npx cap copy # copie le build dans Capacitor
npx cap open android # ou `ios` si tu veux ouvrir Xcode
Pour synchroniser les plateformes :

npx cap sync
💾 6. Supabase (test de connexion)
Aucune commande spécifique ici, tout se fait dans le code.
Mais tu peux tester les appels dans tes composants React, comme tu l'as fait.

🧪 7. Tester (si tu ajoutes des tests)
Si tu ajoutes Vitest, Jest ou autre, tu lanceras les tests avec :

pnpm test
(Ou la commande définie dans ton package.json → scripts.test)

🔁 8. Git (synchronisation locale ↔ GitHub)
Voir l’état du projet :
git status
Ajouter des fichiers à valider :
git add .
Valider un commit :
git commit -m "Mon message clair"
Envoyer les modifications sur GitHub :
git push origin main
Récupérer les dernières modifications depuis GitHub :
git pull origin main
🔒 9. Configurer Git (si jamais tu changes de machine)
git config --global user.name "ton-nom-github"
git config --global user.email "ton-email@exemple.com"
🧹 10. Nettoyer les modules (si bug) et réinstaller
rm -rf node_modules
rm pnpm-lock.yaml
pnpm install
📦 11. Ajouter une dépendance
pnpm add nom-du-package
Pour une dépendance de développement uniquement :

pnpm add -D nom-du-package
✅ Résumé rapide (top commandes à retenir)
🧩 Action ✅ Commande
Entrer dans ton projet cd /Users/Shared/dev/test1
Installer les dépendances pnpm install
Lancer le serveur local pnpm dev
Compiler le projet pnpm build
Copier vers Capacitor npx cap copy
Ouvrir projet Android/iOS npx cap open android / ios
Pousser sur GitHub git push origin main
Tirer les modifs de GitHub git pull origin main
Voir l’état Git git status
Ajouter et valider un commit git add . && git commit -m "..."
