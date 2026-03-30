
- HTTP exceptions used in Application UseCases (forbidden):   
  - `backend/app/Application/TenantAdminDashboard/User/UseCases/AddExperienceRecordUseCase.php:15`  
  - `backend/app/Application/TenantAdminDashboard/User/UseCases/AddExperienceRecordUseCase.php:30`  
  - `backend/app/Application/TenantAdminDashboard/User/UseCases/AddEducationRecordUseCase.php:15`  
  - `backend/app/Application/TenantAdminDashboard/User/UseCases/AddEducationRecordUseCase.php:31`
- Storage/Mail/Crypt/Cache facades in Application (forbidden):  
  - `backend/app/Application/TenantAdminDashboard/LandingPage/UseCases/UploadMediaUseCase.php:9`  
  - `backend/app/Application/TenantAdminDashboard/LandingPage/UseCases/UploadMediaUseCase.php:34`  
  - `backend/app/Application/TenantAdminDashboard/LandingPage/UseCases/DeleteMediaUseCase.php:8`  
  - `backend/app/Application/TenantAdminDashboard/LandingPage/UseCases/DeleteMediaUseCase.php:25`  
  - `backend/app/Application/TenantAdminDashboard/Course/Listeners/GiftActivatedListener.php:10`  
  - `backend/app/Application/TenantAdminDashboard/Course/Listeners/GiftActivatedListener.php:31`  
  - `backend/app/Application/SuperAdminDashboard/PlatformSettings/UseCases/UpdatePlatformSettingsUseCase.php:10`  
  - `backend/app/Application/SuperAdminDashboard/PlatformSettings/UseCases/UpdatePlatformSettingsUseCase.php:73`  
  - `backend/app/Application/SuperAdminDashboard/Tenant/UseCases/UpdateTenantStatusUseCase.php:60`
- Direct Eloquent/Record usage in Application (forbidden):  
  - `backend/app/Application/TenantAdminDashboard/AuditLog/Queries/ListTenantAuditLogsQuery.php:28`  
  - `backend/app/Application/TenantAdminDashboard/User/Queries/ListTenantUsersQuery.php:25`  
  - `backend/app/Application/TenantAdminDashboard/User/Queries/GetTenantUserQuery.php:13`  
  - `backend/app/Application/Auth/UseCases/LoginAdminUseCase.php:43`  
  - `backend/app/Application/Auth/UseCases/ResetPasswordUseCase.php:52`  
  - `backend/app/Application/SuperAdminDashboard/PlatformSettings/UseCases/UpdatePlatformSettingsUseCase.php:66`  
  - `backend/app/Application/SuperAdminDashboard/PlatformSettings/UseCases/UpdatePlatformSettingsUseCase.php:76`

**HTTP Layer Violations (Controllers using Eloquent directly)**
- Direct Record usage in controllers (must delegate to UseCases/Queries only):  
  - `backend/app/Http/TenantAdminDashboard/User/Controllers/TenantUserWriteController.php:101`  
  - `backend/app/Http/TenantAdminDashboard/User/Controllers/TenantUserReadController.php:37`  
  - `backend/app/Http/TenantAdminDashboard/User/Controllers/TenantUserReadController.php:64`  
  - `backend/app/Http/TenantAdminDashboard/Role/Controllers/TenantRoleController.php:63`  
  - `backend/app/Http/TenantAdminDashboard/Role/Controllers/TenantRoleController.php:193`  
  - `backend/app/Http/TenantAdminDashboard/Course/Controllers/TicketController.php:137`  
  - `backend/app/Http/Controllers/Api/TenantAdminDashboard/FileManager/FileManagerReadController.php:33`  
  - `backend/app/Http/Controllers/Api/TenantAdminDashboard/FileManager/FileManagerWriteController.php:54`  
  - `backend/app/Http/Controllers/Api/TenantAdminDashboard/Store/ProductController.php:33`  
  - `backend/app/Http/Controllers/Api/TenantAdminDashboard/Store/ProductCategoryController.php:29`  
  - `backend/app/Http/Controllers/Api/TenantAdminDashboard/Store/ProductOrderController.php:24`  
  - `backend/app/Http/Controllers/Api/SuperAdminDashboard/Communication/AdminMessageController.php:20`  
  - `backend/app/Http/Controllers/Api/TenantAdminDashboard/Notification/NotificationController.php:24`

If you want, I can continue with deeper checks (e.g., strict_types/final enforcement in Commands/UseCases, controller method length, tenant scoping in repositories) or start fixing these violations systematically.

**Application Layer Violations**
- Raw `DB::table()` in Application (forbidden):  
  -\ 
  - `backend/app/Application/Shared/Notification/NotificationPreferenceService.php:30`  