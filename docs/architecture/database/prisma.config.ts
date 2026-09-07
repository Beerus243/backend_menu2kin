// ARCHITECTURE PROPOSÉE, Prisma 7. Objet de configuration sans dépendance au client généré.
// En cible : déplacer ce fichier à la racine et adapter schema/migrations.
const databaseUrl = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DIRECT_DATABASE_URL ou DATABASE_URL requis pour la CLI Prisma');
export default {
  schema: 'schema.prisma',
  migrations: { path: 'migrations' },
  datasource: { url: databaseUrl },
};
