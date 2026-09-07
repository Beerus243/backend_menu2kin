# OpenStreetMap Compliance

Conditions officielles consultées le **7 septembre 2026**. Les droits sur les données et les politiques des services sont deux sujets distincts. Vérifier les versions au lancement et à chaque changement de fournisseur. Le régime hors EEE confirmé précédemment concernait Google ; il ne dispense pas des engagements ODbL.

## Données, licence et partage

OSM permet la copie, l'adaptation et l'usage commercial sous ODbL. Créditer les contributeurs, préserver la licence et les mentions lors des redistributions. Une extraction locale n'est pas présumée insignifiante : des extractions répétées peuvent être substantielles. L'usage public d'une base dérivée, y compris via certains produits issus de celle-ci, peut déclencher l'obligation de proposer la base dérivée ou les modifications sous ODbL. Distinguer base dérivée, base collective et œuvre produite ; ne pas assimiler automatiquement une API JSON à une simple image. [Licence ODbL, §§1, 3, 4](https://opendatacommons.org/licenses/odbl/1-0/).

**Décision technique Menu2Kin :** considérer la couche d'identité/géographie issue d'OSM comme une couche dérivée à rendre disponible sous ODbL lorsqu'elle est utilisée publiquement. Prévoir son export versionné, notices et provenance dès le design. Conserver séparément menus, prix, disponibilité, photos et interactions collectés indépendamment. Cette séparation facilite l'audit ; **des tables séparées ne garantissent pas à elles seules une exemption de partage**. La qualification des enrichissements, liaisons et bases assemblées dépend du fonctionnement réel. Faire examiner ce périmètre avant publication de la couche ; ne pas annoncer toute la base alimentaire « propriétaire » sans cette analyse. [Guide OSMF des couches horizontales](https://osmfoundation.org/wiki/Licence/Community_Guidelines/Horizontal_Map_Layers_-_Guideline).

Préparer un export machine-readable de la couche dérivée réellement utilisée, accompagné de sa licence, date, périmètre, source et changements ; ne pas proposer seulement le PBF original lorsque des modifications doivent être proposées. Le mécanisme et son périmètre doivent satisfaire les obligations applicables, pas une simple page marketing. Il n'impose pas de publier secrets, comptes utilisateurs ou données personnelles. Si un mélange de données interdit de fournir un export conforme, revoir le mélange avant publication.

## Attribution et affichage

Afficher **© OpenStreetMap contributors**, lié à la page copyright OSM, à proximité de la carte ; pour les fiches/listes et téléchargements utilisant les données, fournir une attribution adaptée au support et une indication de licence accessible. Le backend retourne `attributions[]` et des liens de licence ; le futur client doit réellement les présenter. Ajouter les mentions propres au fond de carte et à ses autres sources. Un logo MapLibre ne remplace pas l'attribution des données. [Copyright OSM](https://www.openstreetmap.org/copyright), [directives d'attribution OSMF](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines).

Une URL `image`/Wikimedia/site de restaurant n'est pas une autorisation de copier la photo. Vérifier les droits du média individuellement ; les photos principales viennent de l'équipe ou des restaurants avec autorisation. Pas de scraping de menus ou photos depuis les tags website. Les téléphones publiés peuvent être personnels : minimisation et mécanisme de correction/retrait, sans copier les identités des contributeurs OSM.

## Services publics : règles distinctes

| Service | Conditions vérifiées | Choix Menu2Kin |
|---|---|---|
| API principale OSM | conçue pour l'édition, pas comme backend de lecture ; accès susceptible d'être bloqué | aucun appel utilisateur ni pipeline de catalogue basé dessus |
| Overpass public | ressources partagées, rejet possible et règles par instance ; exemples problématiques : app dépendante du service, balayage mondial | exploration admin ponctuelle ; pas de backend mobile ni contournement des limites par rotation d'instances |
| Nominatim public | maximum absolu 1 requête/s pour l'application entière, identification, attribution et cache ; autocomplete et récupération systématique de POI interdits | désactivé en V1 ; aucune route générique de géocodage public construite ici |
| Tuiles raster OSM publiques | attribution, User-Agent identifiable, cache selon headers ou au moins 7 jours ; pas de téléchargement massif/offline/préchargement | pas de fond de carte de production recommandé ; aucun fallback automatique vers ce service |

Sources : [API OSM](https://operations.osmfoundation.org/policies/api/), [Overpass Commons](https://dev.overpass-api.de/overpass-doc/en/preface/commons.html), [Nominatim Usage Policy](https://operations.osmfoundation.org/policies/nominatim/), [Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/).

Les plafonds Nominatim ne garantissent pas l'acceptation d'un usage régulier. Sa politique encadre aussi les intégrations générées par LLM et exige une décision informée du développeur ; ce dossier ne l'active pas. Un fournisseur privé ou une instance propre a sa propre politique. Le service de tuiles vectorielles OSM public a une politique distincte ; ne pas lui appliquer automatiquement celle du raster.

## Import local et contribution à OSM

OSM → Menu2Kin est une réutilisation sous licence. Menu2Kin → OSM serait une contribution à une base communautaire : processus de consultation, compatibilité des sources et règles d'import/édition automatisée à respecter. Aucun upload vers OSM n'est autorisé ou effectué par ce livrable. Des corrections locales ne doivent jamais être poussées aveuglément dans OSM, notamment si dérivées de Google. [OSM Import Guidelines](https://wiki.openstreetmap.org/wiki/Import/Guidelines).

## Traçabilité de conformité proposée

Chaque lot garde URL du fournisseur approuvé, date réelle du snapshot, hash local SHA-256, version du normalizer, licence, limite géographique et état complet/partiel. Chaque valeur conserve sa source et la référence de version. L'export ODbL a un manifeste et une version correspondant à la couche publiée. Une saisie admin d'une valeur copiée d'OSM reste OSM ; `ADMIN` est un acteur, pas une nouvelle licence.
