# Fintness

Application mobile de journal d'entrainement, construite avec Expo, React Native et TypeScript.

## Etat du scaffold

- Navigation sombre par onglets: Today, History, Progress, Settings.
- Ecran Today utilisable: poids/repetitions +/- , completion d'une serie, chronometre Chronos et retour haptique.
- Modeles TypeScript MongoDB dans `src/types/models.ts`.
- Authentification centralisee dans `src/services/authApi.ts` et Data API dans `src/services/mongoApi.ts`.
- File d'ecritures locale minimale dans `src/services/sync.ts`.
- Les donnees affichees par Today sont encore des donnees de demarrage; le branchement Atlas vient apres la creation des ressources.

## Atlas: configuration pas a pas

> Important: MongoDB a annonce la fin/depreciation des App Services historiques (Data API, HTTPS Endpoints et Device Sync) pour les nouveaux projets autour de 2025. En aout 2026, la console peut donc ne plus proposer Data API pour un nouveau compte. Verifie ce point avant de construire le flux de production. Si l'option manque, conserve `src/services/mongoApi.ts` comme contrat et branche un petit adaptateur Node/Express ou une fonction serverless MongoDB; l'application mobile ne doit jamais contenir la cle MongoDB ni se connecter avec le driver natif.

Si ton compte propose encore App Services/Data API:

1. Ouvre [MongoDB Atlas](https://cloud.mongodb.com), cree un compte puis un projet `Fintness`.
2. Clique `Build a Database`, choisis `M0 Free`, un fournisseur et une region proche de tes utilisateurs. Nomme le cluster `FintnessCluster`.
3. Dans `Database Access`, clique `Add New Database User`. Cree un utilisateur applicatif avec un mot de passe aleatoire. N'utilise pas cet identifiant dans Expo.
4. Dans `Network Access`, ajoute l'IP de developpement. Pour un prototype local, `0.0.0.0/0` est possible temporairement, mais restreins-la avant la production.
5. Dans `Browse Collections`, cree la base `fintness`. Les collections sont creees au premier insert, ou cree-les manuellement: `users`, `exercises`, `workoutDays`, `workoutSessions`, `setLogs`, `personalRecords`.
6. Ouvre `App Services` puis `Create a New App`, choisis le cluster `FintnessCluster`, et appelle l'app `fintness-mobile`.
7. Dans `Authentication`, active `Email/Password`, puis configure la confirmation email et la recuperation de mot de passe selon ton environnement.
8. Dans `Data API`, active l'API et note l'URL endpoint ainsi que l'`App ID`. Autorise seulement les actions necessaires (`find`, `findOne`, `insertOne`, `updateOne`).
9. Configure les regles pour que chaque document soit lisible/modifiable seulement si `userId` correspond a l'utilisateur authentifie. Refuse par defaut les documents sans `userId`.
10. Copie `.env.example` vers `.env` et renseigne les cinq variables avec les valeurs de ton app Atlas. Ces variables publiques ne doivent jamais contenir de mot de passe MongoDB; une URI `mongodb+srv://` est reservee a un backend/serverless et ne doit jamais etre mise dans Expo.

## Schema MongoDB propose

Tous les documents utilisent un champ `userId` indexe. Les identifiants peuvent etre des UUID cote app ou des ObjectId cote API, mais il faut choisir une convention unique.

`users`: `{ _id, email, weightUnit: "kg" | "lb", createdAt }`

`exercises`: `{ _id, userId, name, muscleGroup, targetSets, targetRepMin, targetRepMax, restSeconds, unit, archived }`

`workoutDays`: `{ _id, userId, name, dayOfWeek, exerciseIds: [], active }`

`workoutSessions`: `{ _id, userId, workoutDayId, startedAt, completedAt, totalVolume, notes }`

`setLogs`: `{ _id, userId, sessionId, exerciseId, setNumber, weight, reps, completed, notes, completedAt }`

`personalRecords`: `{ _id, userId, exerciseId, metric: "weight" | "reps" | "volume", value, achievedAt, sessionId }`

Index recommandes: `workoutSessions(userId, startedAt)`, `setLogs(userId, exerciseId, completedAt)`, `personalRecords(userId, exerciseId, metric)` et `workoutDays(userId, dayOfWeek)`.

## Structure

```text
App.tsx
src/
	screens/
		TodayScreen.tsx
		OtherScreens.tsx
	services/
		api.ts          # unique point d'acces Atlas HTTP
		sync.ts         # cache/file locale pour le mode hybride
	types/
		models.ts       # contrats des documents
	theme.ts
```

Ecrans prevus: authentification email/password, Today avec le plan du jour et le log de series, History avec filtres par exercice/session, Progress avec volume/PRs/streak, et Settings pour unite, repos, compte et etat de synchronisation.

## Authentification et environnement

`src/services/authApi.ts` utilise les endpoints App Services `local-userpass/login` et `local-userpass/register`. Le token est conserve avec `expo-secure-store` dans le Keychain iOS ou le Keystore Android, puis restaure au demarrage. `loginWithProvider(provider)` est le point d'extension pour Google ou Apple plus tard.

Avant de lancer l'app, verifie manuellement que ton `.env` contient exactement les cinq noms de `.env.example`, notamment `EXPO_PUBLIC_ATLAS_DATA_API_URL` et non l'ancien `EXPO_PUBLIC_ATLAS_API_URL`. Les variables `EXPO_PUBLIC_*` sont injectees par Metro au demarrage; apres toute modification, redemarre avec `npx expo start -c`.

Si le web fonctionnait mais pas l'emulateur, les causes probables sont:

- le bundle web avait ete genere avant le changement de nom de variable, tandis que l'emulateur lancait un nouveau bundle;
- l'ancienne URI `mongodb+srv://` n'est pas une URL HTTP et ne peut pas etre appelee depuis Expo;
- `localhost` dans une URL d'API pointe vers l'emulateur lui-meme, pas vers ton ordinateur. Utilise une URL Atlas HTTPS publique, ou `10.0.2.2` uniquement pour un backend local Android.

La validation stricte de `config/env.ts` transforme ces erreurs en message explicite au demarrage, avant tout appel reseau.

## Packages

`@react-navigation/native`, `@react-navigation/bottom-tabs`, `react-native-screens`, `react-native-safe-area-context`, `axios`, `@react-native-async-storage/async-storage`, `expo-haptics`, `expo-av`, `react-native-chart-kit`, `react-native-svg` et `@expo/vector-icons`.

Installation deja effectuee:

```bash
npm install
npx tsc --noEmit
npm start
```

Le graphique et l'authentification seront branches quand l'endpoint Atlas sera confirme dans la console. Le mode hybride devra ensuite stocker les lectures dans AsyncStorage, ajouter un identifiant d'operation idempotent a chaque ecriture et vider la file apres reconnexion; les conflits seront resolus par `updatedAt` pour la v1.