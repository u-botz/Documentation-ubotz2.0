# UBOTZ Frontend — Page Architecture Reference  
**Living Model: Tenant Management Module**

---

## Overview

The Tenant Management module is the canonical reference for how new feature pages are built in the UBOTZ super-admin dashboard. Every major feature shares this layering: a thin route-level page, a feature data table with auth-gated actions, modal dialogs for mutations, service-layer isolation, and full RBAC-aware rendering.

Use this document as the authoritative blueprint when building new pages.

---

## 1. File & Folder Conventions

```
app/
└── super-admin-dashboard/
    └── tenants/
        ├── page.tsx              ← Route page (thin — delegates to features)
        ├── loading.tsx           ← Skeleton/loading state for Suspense
        ├── error.tsx             ← Error boundary fallback
        └── [id]/
            └── page.tsx          ← Dynamic route for resource detail

features/
└── tenants/
    └── components/
        ├── tenant-list.tsx             ← Primary list table + pagination + search
        ├── provision-tenant-form.tsx   ← Create mutation modal
        ├── suspend-tenant-dialog.tsx   ← State-change confirmation modal
        ├── activate-tenant-dialog.tsx  ← State-change confirmation modal
        ├── manage-subscription-dialog.tsx
        └── tenant-status-badge.tsx     ← Display-only badge atom

services/
└── tenant-service.ts             ← All API calls + all TypeScript types

shared/
├── hooks/use-auth.tsx            ← Auth context hook (admin session)
├── types/admin.ts                ← AdminRecord + getAuthorityLevel()
├── ui/
│   ├── button.tsx
│   ├── input.tsx
│   ├── spinner.tsx
│   ├── badge.tsx
│   ├── card.tsx
│   ├── table.tsx
│   ├── tabs.tsx
│   ├── dialog.tsx
│   ├── label.tsx
│   └── form-field.tsx
config/
├── routes.ts                     ← Centralised ROUTES object
└── api-endpoints.ts              ← Centralised API_ENDPOINTS object
```

---

## 2. Route Page (`app/.../page.tsx`)

The page file is intentionally **thin**. It:
1. Reads auth context to derive RBAC visibility.
2. Holds minimal UI-level state (`refreshTrigger`, dialog open flags).
3. Renders a header section + the feature list component.
4. Mounts any module-level modals.

```tsx
"use client";

import { useState } from "react";
import { FeatureList } from "@/features/<domain>/components/feature-list";
import { CreateFeatureDialog } from "@/features/<domain>/components/create-feature-dialog";
import { useAuth } from "@/shared/hooks/use-auth";
import { getAuthorityLevel } from "@/shared/types/admin";
import { Button } from "@/shared/ui/button";

export default function FeatureManagementPage() {
    const { admin } = useAuth();
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

    const authInt = getAuthorityLevel(admin);
    const showCreateButton = authInt === 60;   // L4 only. Adjust threshold per feature.

    const handleSuccess = () => setRefreshTrigger(prev => prev + 1);

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex justify-between items-center pb-4 border-b">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800">Feature Title</h1>
                    <p className="text-sm text-slate-500 mt-1">Short subtitle annotation.</p>
                </div>
                {showCreateButton && (
                    <Button onClick={() => setIsCreateDialogOpen(true)}>Create Item</Button>
                )}
            </div>
            <FeatureList refreshTrigger={refreshTrigger} />
            <CreateFeatureDialog
                isOpen={isCreateDialogOpen}
                onClose={() => setIsCreateDialogOpen(false)}
                onSuccess={handleSuccess}
            />
        </div>
    );
}
```

### Key rules for page files
- Always `"use client"` if _any_ interactivity or hooks are needed.
- Never fetch data directly — delegate to the feature component.
- Use `refreshTrigger` (counter) to trigger re-fetches inside child components without prop-drilling a callback.
- RBAC guard visibility at the page level for add/create CTAs.

---

## 3. Detail Page (`app/.../[id]/page.tsx`)

Used for resource drill-down. Pattern is:
1. Extract dynamic param via `useParams()`.
2. Fire parallel data fetches with `Promise.all()` on mount.
3. Each failed fetch degrades gracefully (`.catch(() => ({ data: [] }))`).
4. Render using `<Tabs>` to organise multi-section data.

```tsx
"use client";

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { someService } from '@/services/some-service';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/shared/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Loader2, ArrowLeft } from 'lucide-react';

export default function FeatureDetailPage() {
    const params = useParams();
    const router = useRouter();
    const resourceId = params.id as string;

    const [sectionA, setSectionA] = useState<TypeA[]>([]);
    const [sectionB, setSectionB] = useState<TypeB | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (resourceId) fetchAllData();
    }, [resourceId]);

    const fetchAllData = async () => {
        try {
            setIsLoading(true);
            const [resA, resB] = await Promise.all([
                someService.getSectionA(resourceId).catch(() => ({ data: [] })),
                someService.getSectionB(resourceId).catch(() => ({ data: null })),
            ]);
            setSectionA(resA.data || []);
            setSectionB(resB.data || null);
        } finally {
            setIsLoading(false);
        }
    };

    if (isLoading) return (
        <div className="flex justify-center items-center p-24">
            <Loader2 className="h-12 w-12 animate-spin text-gray-500" />
        </div>
    );

    return (
        <div className="p-6 space-y-6 max-w-6xl mx-auto">
            <div className="flex items-center gap-4">
                <Button variant="ghost" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4 mr-2" /> Back
                </Button>
                <h1 className="text-3xl font-bold tracking-tight">Detail Page Title #{resourceId}</h1>
            </div>

            <Tabs defaultValue="sectionA" className="w-full">
                <TabsList className="grid w-full grid-cols-2 max-w-md">
                    <TabsTrigger value="sectionA">Section A</TabsTrigger>
                    <TabsTrigger value="sectionB">Section B</TabsTrigger>
                </TabsList>

                <TabsContent value="sectionA" className="mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Section A</CardTitle>
                            <CardDescription>Explanation of section A data.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {sectionA.length === 0 ? (
                                <div className="text-center p-8 text-gray-500">No data found.</div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Column 1</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {sectionA.map((item) => (
                                            <TableRow key={item.id}>
                                                <TableCell>{item.field}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
```

---

## 4. Feature List Component

The main list file does the most work. Follow this internal structure:

| Layer | Description |
|---|---|
| **Imports** | Services, shared UI, auth hook, sibling dialog components |
| **Local helpers** | Inline components (modals loaded lazily from data), utility hooks |
| **Props interface** | `{ refreshTrigger: number }` minimum |
| **State declarations** | `data`, `isLoading`, `error`, `page`, `searchTerm`, `dialogState` for each dialog |
| **Auth gate** | `getAuthorityLevel(admin)` → derive permission flags |
| **Data-load effect** | `useCallback(loadData, [page, debouncedSearch])` + `useEffect` depending on `refreshTrigger` |
| **Search reset effect** | Reset `page` to 1 whenever search changes |
| **Render** | Error banner → Loading spinner OR table → Pagination → Dialogs (always mounted at bottom) |

### Dialog state pattern
Each dialog has its own state object:
```tsx
const [suspendDialog, setSuspendDialog] = useState<{
    isOpen: boolean;
    tenantId: number | string;
    tenantName: string;
}>({ isOpen: false, tenantId: "", tenantName: "" });
```
- Open: `setSuspendDialog({ isOpen: true, tenantId: t.id, tenantName: t.name })`
- Close: `setSuspendDialog(prev => ({ ...prev, isOpen: false }))`
- Never mutate the IDs/names on close (keep them for exit animation).

### Inline debounce hook
```tsx
function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
}
```
Always use 500ms delay for search inputs.

### Pagination
```tsx
{meta.total > meta.per_page && (
    <div className="mt-4 flex flex-col md:flex-row items-center justify-between text-sm text-slate-500">
        <div>
            Showing {(meta.current_page - 1) * meta.per_page + 1} to{" "}
            {Math.min(meta.current_page * meta.per_page, meta.total)} of {meta.total} results
        </div>
        <div className="flex gap-2 mt-4 md:mt-0">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page === meta.last_page} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
    </div>
)}
```

---

## 5. Authentication & RBAC

### Hook: `useAuth`
Import from `@/shared/hooks/use-auth`.

```tsx
import { useAuth } from "@/shared/hooks/use-auth";

const { admin } = useAuth();
```

The `admin` is an `AdminRecord | null`. It becomes `null` when unauthenticated.

### Authority level system
Import the helper from `@/shared/types/admin`:

```tsx
import { getAuthorityLevel } from "@/shared/types/admin";

const authInt = getAuthorityLevel(admin);
```

| Level | Role | Permission example |
|---|---|---|
| 10 | Root | Everything |
| 60 | Super Admin (L4) | Provision tenants, manage subscriptions |
| 80 | Platform Admin (L2) | Suspend/activate tenants |

> **Lower integer = higher privilege.** Do not confuse this with percentage-style levels.

### Common permission flags
```tsx
const authInt = getAuthorityLevel(admin);
const canCreate = authInt === 60;                             // Strict L4 only
const canManageStatus = (authInt >= 60 && authInt <= 80) || authInt === 10;
const canManageSubscriptions = authInt === 60;
```

### Conditional rendering pattern
```tsx
{showCreateButton && (
    <Button onClick={openDialog}>Create</Button>
)}
```
Do NOT render a disabled button — simply don't render the element. This prevents UI confusion.

---

## 6. Service Layer

All API interaction lives in `services/<feature>-service.ts`.

### Conventions
- All types are co-located in the same file (interfaces exported alongside the service object).
- Uses `apiClient` from `@/services/api-client`.
- Endpoints referenced from `@/config/api-endpoints`.
- Always returns typed `Promise<ResponseShape>`.

### Data types required per service
```ts
// Status value objects (used by badge displays):
export interface TenantStatusObj { value: string; label: string; }

// Full resource record:
export interface TenantRecord { id: number; name: string; ... }

// Paginated response wrapper:
export interface PaginatedTenantsResponse {
    data: TenantRecord[];
    meta: { current_page: number; last_page: number; per_page: number; total: number; };
}

// Mutation payloads:
export interface ProvisionTenantData { name: string; slug: string; ... }

// Standard error response:
export interface ApiErrorResponse {
    success: false;
    error: { code: string; message: string; trace_id?: string; };
}
```

### Error extraction pattern (used in every catch block)
```ts
const apiErr = err as { response?: { data?: { error?: { message?: string } } } };
setError(apiErr.response?.data?.error?.message || "Fallback error message.");
```

---

## 7. Form Dialog (Create/Mutation)

Based on `ProvisionTenantDialog`. Uses `react-hook-form`.

### Anatomy
1. **Guard render**: `if (!isOpen) return null;`
2. **State**: `isSubmitting`, `globalError`, `globalMessage`
3. **react-hook-form**: `useForm<FormDataType>()`
4. **Submit handler**: async, sets `isSubmitting`, calls service, maps server validation errors to field errors via `setError(fieldName, { type: "server", message })`
5. **Idempotency**: Generate a fresh `uuidv4()` key per submission attempt and pass as `X-Idempotency-Key` header.

```tsx
const idempotencyKey = uuidv4();
await service.create(data, idempotencyKey);
```

6. **Error mapping**:
```tsx
} catch (err: unknown) {
    const apiErr = err as { response?: { data?: { error?: {...}, errors?: Record<string, string[]> } } };
    const responseErrors = apiErr.response?.data?.errors;
    if (responseErrors && typeof responseErrors === 'object') {
        Object.keys(responseErrors).forEach((field) => {
            setError(field as keyof FormData, { type: "server", message: responseErrors[field][0] });
        });
    } else {
        setGlobalError(apiErr.response?.data?.error?.message || "An unexpected error occurred.");
    }
}
```

7. **Layout**: `fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm`
8. **Exit**: Call `reset()` on cancel and on successful close. Always call `setGlobalError(null)` on close.

---

## 8. Confirmation Dialogs (State-Change)

Based on `SuspendTenantDialog` and `ActivateTenantDialog`.

### Props interface (required)
```tsx
interface ConfirmDialogProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    tenantId: number | string;
    tenantName: string;
}
```

### Pattern rules
- Show confirmation text with `tenantName` bolded.
- For **destructive** actions (suspend, delete): require a text `reason` field (min 10 chars). Disable the action button until the reason meets the minimum length.
- For **safe** actions (activate): only confirmation buttons required.
- Always display a local `error` state from the API call inside the dialog.
- Clear error on close.

```tsx
// Destructive guard
const handleAction = async () => {
    if (reason.length < 10) { setError("Reason must be at least 10 characters."); return; }
    ...
};

// Disable button
disabled={isSubmitting || reason.length < 10}
```

---

## 9. Status Badge

Each domain has a co-located badge component that converts a status value object into a colour-coded pill.

```tsx
export function DomainStatusBadge({ status }: { status: StatusObj }) {
    let colorClass = 'bg-slate-100 text-slate-800'; // default
    switch (status.value) {
        case 'active':    colorClass = 'bg-emerald-100 text-emerald-800'; break;
        case 'pending':   colorClass = 'bg-blue-100 text-blue-800'; break;
        case 'suspended': colorClass = 'bg-red-100 text-red-800'; break;
        case 'archived':  colorClass = 'bg-slate-100 text-slate-800'; break;
    }
    return (
        <span className={`px-2 py-1 rounded text-xs font-medium ${colorClass}`}>
            {status.label.toUpperCase()}
        </span>
    );
}
```

---

## 10. loading.tsx

Every route directory **must** have a `loading.tsx`. It must:
- Mirror the page layout using skeleton placeholders (`animate-pulse` divs).
- Import `<Spinner>` and center it in the main content area.
- Not depend on any data or hooks.

```tsx
import { Spinner } from "@/shared/ui/spinner";

export default function Loading() {
    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            <div className="flex justify-between items-center pb-4 border-b">
                <div>
                    <div className="h-8 w-64 bg-slate-200 rounded animate-pulse mb-2" />
                    <div className="h-4 w-96 bg-slate-100 rounded animate-pulse" />
                </div>
                <div className="h-10 w-32 bg-slate-200 rounded animate-pulse" />
            </div>
            <div className="bg-white rounded-xl shadow border p-6">
                <div className="py-12 flex justify-center">
                    <Spinner className="w-8 h-8 text-ubotz-primary opacity-50" />
                </div>
            </div>
        </div>
    );
}
```

---

## 11. error.tsx

Every route directory **must** have an `error.tsx`. It receives `error` and `reset` props from Next.js.

```tsx
"use client";

import { Button } from "@/shared/ui/button";

export default function Error({ error, reset }: { error: Error; reset: () => void; }) {
    return (
        <div className="p-8 max-w-7xl mx-auto">
            <div className="bg-red-50 border border-red-100 rounded-xl p-8 text-center max-w-2xl mx-auto mt-12">
                <h2 className="text-xl font-bold text-slate-800 mb-2">Something went wrong</h2>
                <p className="text-sm text-slate-600 mb-6">We encountered an error loading this page.</p>
                <div className="flex justify-center gap-4">
                    <Button onClick={() => window.location.reload()} variant="outline">Refresh Page</Button>
                    <Button onClick={() => reset()} className="bg-red-600 hover:bg-red-700 text-white border-0">Try Again</Button>
                </div>
            </div>
        </div>
    );
}
```

---

## 12. Shared UI Component Reference

All components imported from `@/shared/ui/`.

| Component | Export | Purpose |
|---|---|---|
| `button.tsx` | `Button` | All buttons; accepts `variant` (`default`, `ghost`, `outline`, `secondary`) and `size` (`sm`, `default`) |
| `input.tsx` | `Input` | Text inputs |
| `badge.tsx` | `Badge`, `badgeVariants` | Status tags; accepts `variant` (`default`, `secondary`, `destructive`, `outline`) |
| `card.tsx` | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` | Content sections |
| `table.tsx` | `Table`, `TableHeader`, `TableBody`, `TableHead`, `TableRow`, `TableCell`, `TableCaption` | Data tables |
| `tabs.tsx` | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | Tabbed content navigation |
| `dialog.tsx` | `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogClose` | Modal dialogs (Radix-based) |
| `label.tsx` | `Label` | Form field labels |
| `form-field.tsx` | `FormField` | Wrapper: label + input + error message |
| `spinner.tsx` | `Spinner` | Loading indicator |
| `select.tsx` | `Select`, etc. | Dropdowns (Radix-based) |
| `textarea.tsx` | `Textarea` | Multi-line text inputs |
| `skeleton.tsx` | `Skeleton` | Loading placeholder |

---

## 13. Page Checklist for New Features

When building a new feature page, verify:

- [ ] `app/super-admin-dashboard/<feature>/page.tsx` — thin, auth-gated CTAs, delegates to feature component
- [ ] `app/super-admin-dashboard/<feature>/loading.tsx` — skeleton matching page layout
- [ ] `app/super-admin-dashboard/<feature>/error.tsx` — standard error boundary
- [ ] `app/super-admin-dashboard/<feature>/[id]/page.tsx` — if detail view needed
- [ ] `features/<feature>/components/feature-list.tsx` — list + pagination + search + dialogs
- [ ] `features/<feature>/components/create-feature-dialog.tsx` — if creation is supported
- [ ] `features/<feature>/components/<action>-dialog.tsx` — one per state-change action
- [ ] `features/<feature>/components/feature-status-badge.tsx` — if status field exists
- [ ] `services/<feature>-service.ts` — all types + API calls
- [ ] RBAC gates verified against the backend role seeder
- [ ] Idempotency key added to POST mutations
- [ ] `refreshTrigger` wired between page and list component

---

## 14. Key Architectural Invariants

> These are **non-negotiable** — do not deviate.

1. **Import paths**: Always `@/shared/ui/...` for UI primitives. Never relative paths to shared.
2. **Auth hook**: Always `@/shared/hooks/use-auth` — never `@/hooks/useAuth`.
3. **Admin types**: Always `@/shared/types/admin` — `AdminRecord`, `getAuthorityLevel`.
4. **No data fetch in page.tsx**: All data in feature components.
5. **RBAC from authority integer**: Never compare role names — always compare `authInt`.
6. **Idempotency on all write operations**: Every `POST` that creates a resource must include `X-Idempotency-Key: uuidv4()`.
7. **Error response shape**: Always use the `ApiErrorResponse` extraction pattern.
8. **Form errors**: Always map server-side validation errors back to field-level errors via `setError`.
9. **Degraded data fetches**: On detail pages, each parallel fetch uses `.catch(() => ({ data: fallback }))` so one failure does not block the entire view.
10. **No direct `<dialog>` or custom modal HTML**: Use `shared/ui/dialog.tsx` or the custom overlay pattern consistently.
