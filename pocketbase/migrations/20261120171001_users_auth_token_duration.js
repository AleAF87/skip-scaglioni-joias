/// Sessão longa: aumenta a duração do authToken da coleção users
/// de 1209600s (14 dias, padrão) para 2592000s (30 dias) — reduz
/// a necessidade de refresh e evita queda de sessão em uso contínuo.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    users.authToken.duration = 2592000
    app.save(users)
  },
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    users.authToken.duration = 1209600
    app.save(users)
  },
)
