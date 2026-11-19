/// Permite que admin/superadmin gerenciem registros de usuários (troca de e-mail
/// e redefinição de senha sem oldPassword) pelo modal de edição de usuários.
/// Sem a manageRule, o PocketBase recusa qualquer PATCH em auth record que
/// envie e-mail alterado ou troca de senha sem a senha atual (400
/// "Failed to update record."), travando o modal de Gestão de Usuários.
/// A proteção contra escalada de privilégios continua no hook
/// pocketbase/hooks/users_protection.js (apenas superadmin manipula superadmin).

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    users.manageRule = "@request.auth.role = 'superadmin' || @request.auth.role = 'admin'"
    app.save(users)
  },
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    users.manageRule = null
    app.save(users)
  },
)
