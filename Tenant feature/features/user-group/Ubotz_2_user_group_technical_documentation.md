# UBOTZ 2.0 — User group — Technical Specification

## Scope

Named **segments** of users for targeting (pricing, CRM, communications). Routes: `backend/routes/tenant_dashboard/user_groups.php` → **`/api/tenant/user-groups`**.

## Capabilities

| Capability | Routes |
|------------|--------|
| `user_group.view` | `GET /user-groups` |
| `user_group.manage` | `POST /user-groups`, `PUT /user-groups/{id}`, `DELETE /user-groups/{id}`, `POST .../members`, `DELETE .../members/{userId}` |

Controller: `App\Http\TenantAdminDashboard\UserGroup\Controllers\UserGroupController`.

## Application use cases

`App\Application\TenantAdminDashboard\UserGroup\UseCases\`: `ListUserGroupsUseCase`, `CreateUserGroupUseCase`, `UpdateUserGroupUseCase`, `DeleteUserGroupUseCase`, `AddUserGroupMemberUseCase`, `RemoveUserGroupMemberUseCase`.

## Persistence (tenant)

| Migration | Table |
|-----------|--------|
| `2026_03_09_162746_create_user_groups_table.php` | **`user_groups`** — `tenant_id`, `name`, `status` (`active`/`inactive`), `created_by`, **unique** `(tenant_id, name)`, **soft deletes** |
| `2026_03_09_162750_create_user_group_members_table.php` | **`user_group_members`** — membership rows |

## Integration

Other features reference groups via pivot tables such as **`ticket_user_groups`** and **`special_offer_user_groups`** (see pricing migrations).

## Frontend

`frontend/config/api-endpoints.ts` — **`TENANT_USER_GROUPS`**: `/api/tenant/user-groups`.

---

## Linked references

- **User** — members are tenant users
- **Pricing** — offers/tickets can target groups
