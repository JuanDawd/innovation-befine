# API design conventions — Innovation Befine

> Defined in T097. All API endpoints and server-side data access must follow these conventions.

---

## Server Actions vs API routes

| Pattern                | When to use                                                                                                                                                             | Examples                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| **Server Actions**     | All mutations (create, update, delete) triggered by user interaction.                                                                                                   | Create ticket, close business day, record payout, update service catalog |
| **API Route Handlers** | Real-time integrations (Pusher webhook), external service callbacks (Resend webhooks), health check, and public endpoints that don't require a form submission context. | `/api/health`, `/api/pusher/auth`, `/api/webhooks/resend`                |

Server Actions are preferred for mutations because they:

- Integrate with `useActionState` / `useFormStatus` for pending states
- Support progressive enhancement (work without JavaScript)
- Automatically inherit the user's session context

---

## Standard error response shape

All server-side functions (Server Actions and API Route Handlers) return typed result objects:

```typescript
type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: { code: string; message: string } };
```

### Error codes

Use `SCREAMING_SNAKE_CASE` for error codes. Common codes:

| Code               | HTTP equiv | Description                                                  |
| ------------------ | ---------- | ------------------------------------------------------------ |
| `VALIDATION_ERROR` | 400        | Input failed Zod validation                                  |
| `UNAUTHORIZED`     | 401        | Not authenticated                                            |
| `FORBIDDEN`        | 403        | Authenticated but insufficient role                          |
| `NOT_FOUND`        | 404        | Entity does not exist                                        |
| `CONFLICT`         | 409        | Duplicate or state conflict (e.g. business day already open) |
| `RATE_LIMITED`     | 429        | Too many requests                                            |
| `STALE_DATA`       | 409        | Optimistic lock version mismatch                             |
| `INTERNAL_ERROR`   | 500        | Unexpected server error (logged to Sentry)                   |

### Zod validation errors

When validation fails, format errors as a field-level array for the client to display inline:

```typescript
type ValidationError = {
  field: string;
  message: string;
};

// Example error response:
{
  success: false,
  error: {
    code: "VALIDATION_ERROR",
    message: "Datos inválidos",
    details: [
      { field: "name", message: "El nombre es obligatorio" },
      { field: "email", message: "Formato de correo inválido" }
    ]
  }
}
```

---

## Pagination pattern

Use **cursor-based pagination** for all list endpoints. Cursor-based pagination is more resilient to real-time data changes (new tickets, status updates) than offset-based.

### Request shape

```typescript
type PaginatedRequest = {
  cursor?: string; // opaque cursor from previous response
  limit?: number; // default: 20, max: 100
  sort?: string; // field name, prefix with "-" for desc (e.g. "-created_at")
};
```

### Response shape

```typescript
type PaginatedResponse<T> = {
  data: T[];
  nextCursor: string | null; // null = no more pages
  hasMore: boolean;
};
```

### Example

```typescript
// Server Action
async function listTickets(
  params: PaginatedRequest,
): Promise<ActionResult<PaginatedResponse<Ticket>>> {
  const { cursor, limit = 20 } = params;
  const tickets = await db.query.tickets.findMany({
    where: cursor ? gt(tickets.id, cursor) : undefined,
    limit: limit + 1, // fetch one extra to determine hasMore
    orderBy: asc(tickets.id),
  });

  const hasMore = tickets.length > limit;
  const data = hasMore ? tickets.slice(0, limit) : tickets;

  return {
    success: true,
    data: {
      data,
      nextCursor: data.length > 0 ? data[data.length - 1].id : null,
      hasMore,
    },
  };
}
```

---

## Input validation

All server-side inputs are validated with **Zod schemas** before reaching business logic.

### Schema location

Shared Zod schemas live in `packages/types/src/schemas/`. The same schema is used by:

- **Server**: Server Action / Route Handler validation
- **Client**: React Hook Form `zodResolver`

### Validation pattern

```typescript
// packages/types/src/schemas/ticket.ts
import { z } from "zod";

export const createTicketSchema = z.object({
  clientId: z.string().uuid().nullable(),
  guestName: z.string().min(1).max(100).nullable(),
  items: z
    .array(
      z.object({
        serviceVariantId: z.string().uuid(),
        employeeId: z.string().uuid(),
        priceOverride: z.number().int().nonnegative().nullable(),
      }),
    )
    .min(1),
});

export type CreateTicketInput = z.infer<typeof createTicketSchema>;
```

---

## Server state caching (TanStack Query)

Use **TanStack Query** for all GET-derived data on the client. Invalidate queries after mutations.

### Stale times by data type

| Data type             | Stale time    | Rationale                              |
| --------------------- | ------------- | -------------------------------------- |
| Service catalog       | 5 minutes     | Changes infrequently, admin-only edits |
| Employee list         | 5 minutes     | Changes infrequently                   |
| Client search results | 30 seconds    | May have new clients during busy hours |
| Tickets (dashboard)   | 0 (real-time) | Real-time updates via Pusher           |
| Business day status   | 0 (real-time) | Changes affect all operations          |
| Analytics data        | 1 minute      | Pre-computed, not real-time critical   |

### Query key convention

```typescript
// Use arrays with entity type + params
queryKey: ["tickets", { status: "open", businessDayId }];
queryKey: ["employees", "list"];
queryKey: ["services", "catalog"];
queryKey: ["analytics", "revenue", { period: "daily", date }];
```

### Invalidation after mutations

```typescript
const mutation = useMutation({
  mutationFn: closeTicket,
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["tickets"] });
    queryClient.invalidateQueries({ queryKey: ["analytics"] });
  },
});
```

---

## Form pattern (React Hook Form)

All forms use **React Hook Form** with `zodResolver`. Zod schemas are shared between client and server via `packages/types`.

```typescript
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { createTicketSchema, type CreateTicketInput } from "@befine/types/schemas/ticket";

function CreateTicketForm() {
  const form = useForm<CreateTicketInput>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: { items: [] },
  });

  async function onSubmit(data: CreateTicketInput) {
    const result = await createTicketAction(data);
    if (!result.success) {
      // Map server validation errors to form fields
      if (result.error.details) {
        for (const { field, message } of result.error.details) {
          form.setError(field as keyof CreateTicketInput, { message });
        }
      }
    }
  }

  return <form onSubmit={form.handleSubmit(onSubmit)}>...</form>;
}
```

---

## Client state (Zustand)

Use **Zustand** only for ephemeral UI state that is not derived from the server:

| OK to use Zustand for                | NOT OK              |
| ------------------------------------ | ------------------- |
| Offline queue count                  | Ticket list data    |
| Sidebar open/close                   | User session        |
| Notification count (unseen badge)    | Service catalog     |
| UI preferences (filters, sort order) | Business day status |

```typescript
import { create } from "zustand";

interface UIStore {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  offlineQueueCount: number;
  setOfflineQueueCount: (count: number) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  sidebarOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
  offlineQueueCount: 0,
  setOfflineQueueCount: (count) => set({ offlineQueueCount: count }),
}));
```

---

## Rate limiting policy

Apply rate limiting to all mutation endpoints, not just login.

| Endpoint category | Limit               | Scope     |
| ----------------- | ------------------- | --------- |
| Login             | Better Auth default | Per IP    |
| Password reset    | 5 requests / hour   | Per email |
| Email sends       | 10 / minute         | Per user  |
| Ticket creation   | 30 / minute         | Per user  |
| Payout recording  | 5 / minute          | Per admin |
| Catalog edits     | 20 / minute         | Per admin |
| General mutations | 60 / minute         | Per user  |

### Implementation

Use `@upstash/ratelimit` (Redis-based) or a custom in-memory token bucket for MVP. Rate limiting middleware runs before the business logic handler.

```typescript
import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(60, "1 m"),
  analytics: true,
});
```

When rate-limited, return:

```typescript
{
  success: false,
  error: {
    code: "RATE_LIMITED",
    message: "Demasiados intentos. Intenta de nuevo en 1 minuto.",
  }
}
```

---

## Idempotency

All mutating server actions and API route handlers that create or modify financial records accept an idempotency key to prevent duplicate side effects on retry.

### How the key is resolved (T09R-R3)

The server extracts the key from **either** source, preferring the header:

1. `Idempotency-Key` HTTP request header — preferred for API route handlers
2. `idempotencyKey` field in the JSON/form body — used by server actions

```typescript
import { headers } from "next/headers";

async function resolveIdempotencyKey(bodyKey?: string): Promise<string | undefined> {
  const h = await headers();
  return h.get("idempotency-key") ?? bodyKey;
}
```

Server actions receive the key as part of the validated Zod schema (`idempotencyKey: z.uuid()`). For API route handlers, additionally read the header:

```typescript
// apps/web/src/app/api/example/route.ts
export async function POST(req: Request) {
  const body = await req.json();
  const h = headers();
  const idempotencyKey = h.get("idempotency-key") ?? body.idempotencyKey;
  // ...
}
```

### Idempotency key requirements

- Must be a **client-generated UUID v4**
- Expires after **24 hours**
- Duplicate requests with the same key return the cached `ActionResult` without re-executing
- The key is stored alongside the mutation result in `idempotency_keys` table

### Implementation

Use the shared helpers in `apps/web/src/lib/idempotency.ts`. Call `storeIdempotency` **inside** the same DB transaction as the mutation (T09R-R12):

```typescript
const txResult = await txDb.transaction(async (tx) => {
  const cached = await checkIdempotency(idempotencyKey, tx);
  if (cached) return cached as ActionResult<T>;

  const result = await doMutation(tx);
  await storeIdempotency(idempotencyKey, "routeName", result, tx);
  return result;
});
```

---

## API Route Handler conventions

For the few endpoints that use Route Handlers instead of Server Actions:

```typescript
// app/api/health/route.ts
import { NextResponse } from "next/server";

export async function GET() {
  try {
    // DB connectivity check
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({ status: "ok", timestamp: new Date().toISOString() });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 503 });
  }
}
```

- Always return JSON
- Use appropriate HTTP status codes
- Include `timestamp` in health check responses
- Log errors to Sentry before returning error responses
