# Contrat OpenAPI proposé

`openapi.json` décrit 95 opérations et 86 schémas. C'est un contrat cible, aucun serveur métier n'est associé aujourd'hui. `servers.url=/` utilise l'origine choisie par l'outil de consultation ; configurer le serveur local après implémentation.

Source éditable : `generate.py`. Depuis la racine du dépôt :

```bash
python3 docs/architecture/contracts/generate.py
```

Cette commande regénère `openapi.json` et `../03-api.md` depuis le même inventaire. Modifier le générateur avant de régénérer, pour conserver les règles détaillées. Les autres documents ne sont pas générés par ce script.

Le contrat est validé avec Redocly CLI. À l'implémentation, les classes DTO NestJS et Swagger devront reproduire ces schémas, les guards leurs politiques et les tests de contrat leurs réponses. OpenAPI ne valide pas à lui seul les règles cross-field et les droits métier : voir les fiches d'endpoints et règles Given/When/Then.
