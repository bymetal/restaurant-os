# Restaurant OS — Nihai Ürün, Mimari ve Geliştirme Master Planı

> **Doküman amacı:** Bu dosya, OpenCode/AI coding agent’ın projeyi baştan sona anlayıp geliştirebilmesi için ürün gereksinimlerini, kullanıcı akışlarını, teknik mimariyi, entegrasyonları, güvenlik kararlarını, API/secret ihtiyaçlarını, geliştirme sırasını ve kabul kriterlerini tek yerde toplar.
>
> **Çalışma biçimi:** Bu proje bir restoran için özel yazılım değil; çok sayıda restoranın kullanabileceği **multi-tenant SaaS** olarak geliştirilecektir.
>
> **Runtime AI:** Yok. Hermes kullanılmayacak.
>
> **Otomasyon:** n8n kullanılabilir ve kullanılmalıdır; fakat kritik business logic n8n’e bırakılmayacaktır.
>
> **WhatsApp katmanı:** Evolution API.
>
> **Not sistemi:** Proje klasörü Obsidian vault içinde tutulabilir. `opencode-mem` eklentisi kullanılmaktadır. AI, kalıcı kararları ve proje hafızasını aşağıda tanımlanan Markdown dosyalarında tutmalıdır.

---

# 0. Ürünün Kısa Tanımı

Restaurant OS; restoranların müşterilerini QR + WhatsApp üzerinden kendi CRM’lerine almasını, müşterilerin doğrudan restoran üzerinden komisyonsuz sipariş vermesini, sadakat puanı/damga kazanmasını, ödül kullanmasını, restoranın siparişi mutfağa/Telegram’a/yazıcıya otomatik iletmesini ve tüm bu davranışlardan gelişmiş müşteri, satış ve pazarlama analitiği üretmesini sağlayan SaaS platformudur.

Platform iki temel yönetim düzeyine sahiptir:

1. **Platform / Super Admin**
   - Bütün restoranları görür.
   - Bütün tenant’ları, şubeleri, Evolution bağlantılarını, sipariş hacimlerini ve sistem sağlığını görür.
   - Plan, abonelik, tenant açma-kapama, özellik yetkileri ve destek işlemlerini yönetir.

2. **Restaurant Tenant**
   - Restoran sahibi yalnızca kendi işletmesini görür.
   - Şubelerini, personelini, menüsünü, siparişlerini, müşterilerini, loyalty programlarını, kampanyalarını ve analytics ekranlarını yönetir.
   - Restaurant owner başka restoranın hiçbir verisine erişemez.

---

# 1. Ürünün Ana Değer Önerisi

Ürün “QR sadakat kartı” olarak konumlandırılmayacak.

Ana vaat:

> **Restoranınızın kendi müşteri, sipariş ve sadakat sistemi.**
>
> Müşterilerinizi QR ve WhatsApp üzerinden kendi CRM’inize alın, doğrudan sipariş toplayın, sadakat programıyla tekrar getirin, otomatik operasyon yürütün ve hangi müşterinin ne kadar değer ürettiğini ölçün.

Ana bileşenler:

- QR Customer Acquisition
- WhatsApp CRM
- Direct Ordering
- Loyalty & Rewards
- Campaign Automation
- Restaurant Operations
- Telegram Notifications
- Auto Printing
- Advanced Analytics
- Multi-Branch
- Multi-Tenant SaaS
- Platform Super Admin

---

# 2. Temel Ürün Prensipleri

## 2.1 Multi-tenant baştan zorunlu

İlk müşteri tek restoran olsa dahi mimari:

```text
Platform
 ├── Restaurant A
 │    ├── Branch A1
 │    └── Branch A2
 ├── Restaurant B
 │    └── Branch B1
 └── Restaurant C
```

şeklinde kurulmalıdır.

Ana entity’lerde tenant izolasyonu:

```text
business_id
branch_id (gereken tablolarda)
```

bulunmalıdır.

## 2.2 n8n business logic motoru değildir

n8n kullanılacak alanlar:

- webhook sonrası otomasyon
- bildirim
- WhatsApp mesaj gönderimi
- Telegram mesaj gönderimi
- scheduled campaigns
- abandonment workflow
- daily/weekly reports
- event fan-out
- entegrasyon glue işleri

n8n’e bırakılmayacak alanlar:

- order total hesaplama
- ürün fiyatı hesaplama
- discount doğrulama
- loyalty balance
- stamp claim
- reward redemption
- payment state
- authorization
- tenant isolation
- stock/availability state
- final order creation

Bunlar Core API’de deterministik ve test edilebilir olmalıdır.

## 2.3 Telefon numarası müşteri kimliği için güçlü sinyaldir ama primary key değildir

DB customer ID UUID/ULID olmalıdır.

Telefon normalize edilmiş unique alan olarak kullanılabilir:

```text
+90 532...
0532...
90532...
```

aynı forma normalize edilir.

Öneri:

```text
905321234567
```

## 2.4 Finansal/puan işlemleri ledger mantığında tutulur

Sadece:

```text
customer.points = 420
```

tutmak yeterli değildir.

Her hareket:

```text
loyalty_transactions
```

tablosuna yazılır.

---

# 3. Kullanıcı Rolleri ve Yetkilendirme

## 3.1 Platform rolleri

### SUPER_ADMIN

Tam yetki:

- bütün tenant’ları görme
- tenant oluşturma
- tenant askıya alma
- tenant silme/pasifleştirme
- plan değiştirme
- restaurant owner atama
- tenant impersonation (audit log zorunlu)
- global system metrics
- Evolution instance sağlık durumu
- n8n integration health
- platform hata logları
- feature flags
- SaaS billing
- global announcements
- support tools

### PLATFORM_SUPPORT

Sınırlı destek rolü:

- tenant görüntüleme
- bağlantı sağlık kontrolü
- sipariş ve entegrasyon logu görüntüleme
- secret görüntüleyemez
- tenant finansal/pazarlama verisine yalnızca yetki verilirse ulaşır
- değişiklik yaparsa audit log zorunlu

---

## 3.2 Restaurant rolleri

### OWNER

- kendi business’ının her alanına erişir
- şube oluşturur
- personel davet eder
- menü
- sipariş
- loyalty
- CRM
- analytics
- campaigns
- integrations
- printers
- restaurant settings
- subscription ekranı

### MANAGER

- operasyon + müşteri + sipariş
- analytics
- kampanya
- loyalty
- menü
- personel yetkisi opsiyonel

### CASHIER

- sipariş
- müşteri arama
- loyalty QR üretme
- reward redeem
- manuel loyalty değişikliği ancak policy izin verirse
- gelişmiş finansal analytics yok

### KITCHEN

- Kitchen Display
- sipariş içeriği
- preparing/ready status
- müşteri CRM bilgisi minimum

### MARKETING

- müşteri segmentleri
- campaigns
- marketing analytics
- menü kampanyaları
- loyalty
- sipariş operasyonuna tam erişim yok

### ANALYST

- read-only analytics
- export

---

# 4. Genel Mimari

```text
                           PUBLIC INTERNET
                                  │
              ┌───────────────────┼───────────────────┐
              │                   │                   │
         LANDING PAGE       CUSTOMER STOREFRONT    ADMIN APP
          Next.js                PWA/Next.js         Next.js
              │                   │                   │
              └───────────────────┼───────────────────┘
                                  │
                              CORE API
                         Fastify + TypeScript
                                  │
              ┌───────────────────┼────────────────────┐
              │                   │                    │
         PostgreSQL             Redis            Object Storage
              │                   │                    │
              └───────────────┬───┴────────────────────┘
                              │
                         Domain Events
                              │
                        Outbox / Worker
                              │
           ┌──────────────────┼───────────────────────┐
           │                  │                       │
      Evolution API          n8n                  Telegram
           │                  │                       │
       WhatsApp          Automations             Restaurant
                                                  Operations

                              │
                         Print Gateway
                              │
                      Restaurant Print Agent
                              │
                        ESC/POS Printer
```

---

# 5. Önerilen Teknoloji Stack’i

## Core

- Node.js
- TypeScript
- Fastify
- PostgreSQL
- Prisma veya Drizzle
- Redis
- Zod
- OpenAPI

## Frontend

- Next.js
- TypeScript
- React
- Tailwind
- shadcn/ui veya benzeri tutarlı component system
- TanStack Query
- React Hook Form + Zod

## Queue / async

İlk sürüm:

- PostgreSQL Outbox + worker
- Redis job queue gerekiyorsa BullMQ

Sistem büyüyünce queue ayrı ölçeklenebilir.

## Observability

- structured JSON logs
- Sentry opsiyonel ama tavsiye edilir
- health endpoints
- uptime checks
- Prometheus/Grafana opsiyonel

## Testing

- Vitest
- API integration tests
- Playwright E2E
- testcontainers veya disposable PostgreSQL

---

# 6. SaaS Domain Model

Temel hierarchy:

```text
Platform
 └── Business
      ├── Subscription
      ├── Users
      ├── Integrations
      └── Branches
           ├── Menu
           ├── Orders
           ├── Printers
           └── Operations
```

Her restaurant:

```text
business
```

Her fiziksel lokasyon:

```text
branch
```

Bir restaurant tek şubeli de olabilir.

---

# 7. Super Admin Dashboard

Platform yöneticisinin giriş sayfası cross-tenant overview vermelidir.

## KPI

- Total Restaurants
- Active Restaurants
- Trial Restaurants
- Suspended Restaurants
- Total Branches
- Total Customers
- Orders Today
- GMV Today
- Orders 30d
- GMV 30d
- Loyalty Members
- Messages Sent
- Active Evolution Instances
- Disconnected Evolution Instances
- Failed Webhooks
- Failed Print Jobs
- n8n Integration Errors
- Platform MRR
- Platform ARR
- Churn
- Trial → Paid Conversion

## Tenant list

Kolonlar:

- Business
- Owner
- Plan
- Branch Count
- Customer Count
- Orders 30d
- GMV 30d
- WhatsApp State
- Last Activity
- Subscription
- Status

Filtreler:

- active
- trial
- suspended
- disconnected WhatsApp
- no orders
- high volume
- failed payment

## Tenant detail

Super admin bir restaurant’a girdiğinde:

- Overview
- Owner/users
- Branches
- Usage
- Orders
- Customers
- Loyalty
- Campaign stats
- Evolution instance(s)
- webhook health
- print device health
- subscription
- audit log
- errors
- feature flags

## Güvenlik

Super admin tenant impersonation yaparsa:

```text
impersonation_started
impersonation_ended
actor_user_id
target_business_id
reason
ip
timestamp
```

audit log’a yazılmalıdır.

---

# 8. Restaurant Owner Dashboard

Restaurant owner yalnızca kendi tenant’ını görür.

Ana dashboard:

## Today

- Revenue
- Net Revenue
- Orders
- Average Order Value
- New Customers
- Returning Customers
- Loyalty Claims
- Rewards Redeemed
- Campaign Revenue
- Delivery / Pickup / Dine-in share

## 7d / 30d

- Revenue trend
- order trend
- customer trend
- returning rate
- repeat purchase
- top products
- top categories
- busiest hours
- busiest days
- acquisition sources
- loyalty impact
- campaign attribution
- abandoned carts
- recovered carts

## Branch comparison

- revenue
- orders
- AOV
- new customers
- loyalty usage
- conversion
- repeat rate

---

# 9. Public Landing Page

Platformun restaurant sahiplerini çekmek için ayrı bir satış landing page’i olmalıdır.

## URL

Örnek:

```text
https://domain.com
```

Restaurant storefront’ları:

```text
https://domain.com/r/{restaurantSlug}
```

veya custom domain desteği ileride.

## Hero

### Başlık

> Restoranınızın müşterisini, siparişini ve sadakatini kendi sisteminizde yönetin.

### Alt başlık

> QR + WhatsApp ile müşteri kazanın, komisyonsuz sipariş alın, otomatik sadakat programı kurun ve müşterilerinizi tekrar siparişe döndürün.

### CTA

- Demo İste
- Sistemi Gör
- Restaurantını Başlat

## Landing Page bölümleri

1. Hero
2. Problem
3. “Müşteri başka platformda kalmasın”
4. Nasıl çalışır?
5. QR → WhatsApp → CRM
6. Direct Ordering
7. Loyalty
8. Auto Printing / Operations
9. WhatsApp Marketing
10. Advanced Analytics
11. Multi-Branch
12. Screenshots / demo
13. Restaurant owner testimonial alanı
14. Pricing
15. FAQ
16. Final CTA
17. Contact / WhatsApp

## Görsel anlatım

Basit 4 adımlı akış:

```text
QR okut
   ↓
WhatsApp ile katıl
   ↓
Sipariş + Sadakat
   ↓
Restaurant CRM + Analytics
```

## Landing analytics

Minimum:

- page_view
- demo_click
- pricing_view
- form_start
- form_submit
- whatsapp_click

Öneri:

- PostHog
- Plausible
- GA4

Bunlardan yalnız biri başlangıçta yeterlidir.

---

# 10. Restaurant Onboarding

Restaurant owner kayıt akışı:

```text
Sign Up
  ↓
Business Create
  ↓
Business Info
  ↓
Branch Create
  ↓
Menu Import/Create
  ↓
WhatsApp Connect
  ↓
Loyalty Setup
  ↓
Order Settings
  ↓
Printer/Telegram Optional
  ↓
Test Order
  ↓
Go Live
```

## Onboarding bilgileri

### Business

- Restaurant name
- legal/display name
- slug
- logo
- cover
- phone
- email
- timezone
- currency
- language

### Branch

- branch name
- full address
- location coordinates optional
- working hours
- preparation time
- delivery settings
- pickup enabled
- dine-in enabled

### WhatsApp

Restaurant başına tercihen kendi Evolution instance.

Gerekli bilgiler:

- Evolution instance name
- Evolution instance ID
- API token/key
- connected WhatsApp number
- connection state
- webhook configuration

### Loyalty

- loyalty enabled
- stamps/points
- reward threshold
- reward
- expiry rules
- welcome bonus
- max claim policies

### Menu

- categories
- products
- variants
- modifiers
- prices
- availability

### Operations

- Telegram enabled?
- printer enabled?
- kitchen display enabled?

---

# 11. WhatsApp / QR Acquisition Flow

Bu QR’ın görevi müşteriyi CRM’e almaktır; loyalty claim vermek zorunda değildir.

Restaurant farklı kaynaklar için farklı QR oluşturabilir:

```text
TABLE_01
TABLE_02
TAKEAWAY_BOX
FLYER
INSTAGRAM
GOOGLE_MAPS
CASHIER
WINDOW
```

QR WhatsApp deep link açar:

```text
KATIL {sourceToken}
```

Evolution incoming message:

```text
MESSAGES_UPSERT
```

Core flow:

```text
Incoming Webhook
  ↓
verify source
  ↓
deduplicate message
  ↓
normalize sender phone
  ↓
find/create customer
  ↓
record acquisition source
  ↓
record consent state
  ↓
create loyalty account if enabled
  ↓
send welcome
```

Welcome response:

> 🍕 Hoş geldin!
>
> Artık buradan sipariş verebilir, sadakat puanlarını takip edebilir ve sana özel fırsatlardan haberdar olabilirsin.
>
> [Sipariş Ver] [Puanlarım] [Rehbere Kaydet]

---

# 12. Rehbere Kaydet

Backend restaurant için dinamik `.vcf` üretebilir.

Alanlar:

- restaurant name
- phone
- website/order URL
- address

Restaurant owner:

```text
Settings → Contact Card
```

ekranından düzenleyebilir.

---

# 13. Marketing Consent

Müşterinin WhatsApp’a ilk mesaj atması otomatik olarak tüm pazarlama kullanım senaryoları için sınırsız izin varsayımı olarak değerlendirilmemelidir.

Sistemde explicit consent state tutulmalıdır.

```text
customer_consents
- id
- customer_id
- business_id
- type
- status
- source
- captured_at
- withdrawn_at
- policy_version
```

Örnek consent türleri:

```text
TRANSACTIONAL
MARKETING
LOYALTY
```

Opt-out:

```text
STOP
IPTAL
MESAJ ISTEMIYORUM
```

gibi kurallar konfigüre edilebilir.

Admin manuel opt-out’u geri açamamalı; yeni geçerli opt-in olayı gerekir.

---

# 14. Loyalty QR Flow

Loyalty QR acquisition QR’dan farklıdır.

## Güvenli yöntem

Restaurant POS/kasa panelinde:

```text
[YENİ SADAKAT QR]
```

butonuna basılır.

Backend:

```text
POST /loyalty/claim-tokens
```

oluşturur.

Token:

- cryptographically random
- tek kullanımlık
- expiration
- business-bound
- branch-bound
- optionally order-bound
- hash stored in DB
- consumed atomically

QR:

```text
SADAKAT {token}
```

WhatsApp’a prefilled olarak gider.

Core transaction:

```text
verify webhook/message
↓
dedupe
↓
find customer
↓
lock/consume claim token atomically
↓
create loyalty transaction
↓
update materialized balance
↓
evaluate reward rules
↓
commit
↓
emit loyalty.stamp_added
```

Aynı token ikinci kez kullanılırsa puan verilmez.

---

# 15. Loyalty Engine

Restaurant seçebilmeli:

## Stamp

```text
10 order = reward
```

## Points

```text
1 TL = X point
```

## Hybrid

```text
order +1 stamp
spend-based points
```

## Kurallar

- minimum order amount
- branch
- category
- product
- day
- hour
- campaign
- first order
- welcome
- birthday
- double points day

Örnek:

```text
Pazartesi 15:00–18:00
x2 points
```

---

# 16. Loyalty Ledger

Tablo:

```text
loyalty_transactions
- id
- business_id
- customer_id
- loyalty_account_id
- branch_id
- order_id nullable
- reward_id nullable
- transaction_type
- amount
- balance_after
- source
- actor_user_id nullable
- idempotency_key
- metadata
- created_at
```

Transaction types:

```text
EARN
BONUS
ADJUSTMENT_ADD
ADJUSTMENT_REMOVE
REDEEM
EXPIRE
REFUND_REVERSAL
```

---

# 17. Reward Engine

Reward rule örnekleri:

```text
10 stamps → Free Pizza
500 points → 100 TL Discount
Birthday → Dessert
```

Rewards:

```text
AVAILABLE
RESERVED
REDEEMED
EXPIRED
CANCELLED
```

Ödül tek kullanımlık olmalıdır.

Restaurant employee redeem ederken:

- QR
- customer profile
- reward code

kullanabilir.

Redemption audit log’a yazılır.

---

# 18. Customer Storefront / Ordering

Customer WhatsApp içindeki “Sipariş Ver” butonu signed session link açar.

Telefon numarasını çıplak URL query parametresinde taşımayın.

Öneri:

```text
/r/{slug}?session={shortLivedSignedToken}
```

İlk ziyaret sonunda secure session cookie.

Alternatif public order:

```text
/r/{slug}
```

ziyaretçisi sipariş verebilir fakat loyalty hesabını bağlamak için telefon doğrulaması gerekir.

---

# 19. Storefront Ana Ekran

- restaurant branding
- branch
- open/closed
- estimated preparation
- loyalty summary
- available reward
- day’s pizza
- categories
- search
- product cards
- cart

Örnek:

```text
Mario Pizza

Merhaba Ahmet 👋
7 / 10 damga
3 damga sonra ödül

🔥 Günün Pizzası
Pepperoni Deluxe
280₺ → 229₺

[Sepete Ekle]
```

---

# 20. Menü Modeli

```text
menus
categories
products
product_variants
modifier_groups
modifiers
product_branch_availability
```

## Product

- name
- description
- photo
- category
- base price
- active
- allergens optional
- tags
- prep metadata

## Variant

- small
- medium
- large

## Modifier Group

Örnek:

```text
Boy
Hamur
Ekstra Malzeme
İçecek Seçimi
Sos
```

Kurallar:

- required
- min selections
- max selections
- multi-select
- additional price

---

# 21. Product Availability

Restaurant:

```text
Product → Out of stock
```

yapabilmeli.

Destek:

- global
- branch
- until date/time
- scheduled availability

Örnek:

```text
Breakfast menu
08:00–12:00
```

---

# 22. Cart

Server-side cart:

```text
carts
cart_items
cart_item_modifiers
```

Track:

- started_at
- updated_at
- checked_out_at
- abandoned_at
- recovered_at
- source

Cart event’leri analytics için tutulmalıdır.

---

# 23. Upsell / Cross-sell

Restaurant rule builder:

```text
IF category=PIZZA
AND no category=DRINK
THEN offer=1L Cola
```

veya:

```text
IF product=Pepperoni
THEN recommend=Fries
```

Event:

```text
upsell.impression
upsell.accepted
upsell.dismissed
```

Analytics:

- impression
- conversion
- added revenue
- attach rate

---

# 24. Checkout

Fulfillment:

- Delivery
- Pickup
- Dine-in / Table
- optional scheduled order

Customer:

- name
- phone
- saved address
- note
- delivery instructions

Payment:

- Cash on delivery
- Card on delivery
- Pay at restaurant
- Online payment (provider integration)

---

# 25. Address Model

```text
customer_addresses
- label
- address_text
- district
- city
- postal_code
- lat
- lng
- building
- apartment
- floor
- instructions
```

Müşteri:

- Ev
- İş
- Diğer

olarak saklayabilir.

---

# 26. Delivery Zones

Restaurant branch bazlı delivery policy:

```text
delivery_zones
- polygon/radius
- min_order
- delivery_fee
- free_delivery_threshold
- estimated_minutes
```

İlk MVP’de:

- district list
- postal code list
- radius

kullanılabilir.

Daha sonra gerçek map polygon.

---

# 27. Order State Machine

Durumlar:

```text
DRAFT
PLACED
ACCEPTED
PREPARING
READY
OUT_FOR_DELIVERY
DELIVERED

REJECTED
CANCELLED
REFUNDED
```

Her state transition server tarafından validate edilmelidir.

Örneğin:

```text
DELIVERED → PREPARING
```

yasak.

---

# 28. Order Database

```text
orders
order_items
order_item_modifiers
order_events
order_adjustments
order_payments
```

Order snapshot fiyatları tutulmalıdır.

Ürün fiyatı sonradan değişse bile geçmiş order değişmemelidir.

Her order item:

```text
product_name_snapshot
variant_name_snapshot
unit_price
modifier_snapshot
tax
discount
line_total
```

---

# 29. Order Creation Güvenliği

Client’tan gelen:

```text
total=250
```

güvenilmez.

Backend:

1. ürünleri DB’den yükler
2. aktiflik kontrolü
3. branch availability
4. variant fiyat
5. modifier
6. campaign
7. coupon
8. delivery
9. tax
10. final total

hesaplar.

---

# 30. Telegram Operation Channel

Restaurant isterse Telegram bot bağlar.

Yeni order:

```text
🔴 YENİ SİPARİŞ #10482

Şube: Florya
Müşteri: Ahmet
Telefon: 0532 *** ** 19

1x Büyük Karışık
 + İnce Hamur
 + Extra Mozzarella

2x Cola

Toplam: 620₺
Ödeme: Kapıda Kart
Teslimat: Adrese

Not: Zili çalmayın.
```

Buttons:

```text
[Kabul Et]
[Reddet]
[Hazırlanıyor]
[Hazır]
[Yola Çıktı]
[Teslim Edildi]
```

Telegram callback doğrudan Core API’ye signed endpoint üzerinden gitmelidir.

Telegram n8n üzerinden bildirime dönüştürülebilir ancak state mutation Core API’de yapılmalıdır.

---

# 31. Printer Agent

Restaurant PC / mini PC / Raspberry Pi üzerinde küçük local agent.

Tek görev:

- authenticate
- websocket/poll
- pending print jobs al
- ESC/POS bas
- ack
- health heartbeat

## Print Jobs

```text
print_jobs
- id
- business_id
- branch_id
- device_id
- order_id
- type
- payload
- status
- attempts
- last_error
- created_at
- printed_at
```

States:

```text
PENDING
SENT
PRINTED
FAILED
CANCELLED
```

## Printer türleri

- Kitchen receipt
- Cashier receipt
- Pizza box label
- Delivery label

Agent offline olduğunda job kaybolmamalıdır.

---

# 32. Kitchen Display System

Restaurant isterse Telegram yerine veya yanında browser tabanlı KDS.

Columns:

```text
NEW
PREPARING
READY
```

Card:

- order number
- elapsed time
- items
- modifiers
- notes
- fulfillment
- priority

Kitchen user müşteri CRM verisinin tamamını görmemelidir.

---

# 33. WhatsApp Order Status

Domain events:

```text
order.accepted
order.preparing
order.ready
order.out_for_delivery
order.delivered
order.cancelled
```

n8n/Evolution ile transactional notification.

Örnek:

> 👨‍🍳 Siparişin hazırlanıyor.
>
> Sipariş #10482

---

# 34. Evolution API Tasarımı

Tercih:

**Restaurant başına ayrı Evolution instance.**

Mapping:

```text
integration_connections
- business_id
- provider=EVOLUTION
- instance_name
- instance_id
- encrypted_api_key/token
- phone
- connection_state
- webhook_state
- last_seen_at
```

Incoming event:

```text
MESSAGES_UPSERT
```

kullanılır.

Gerekli diğer event’ler:

- CONNECTION_UPDATE
- MESSAGES_UPDATE (ihtiyaca göre)
- SEND_MESSAGE (observability gerekirse)

Super Admin:

- connected
- connecting
- disconnected
- webhook failing

durumlarını görür.

---

# 35. Evolution Webhook Ingestion

Webhooks önce Core API’ye gelsin.

Örnek:

```text
POST /webhooks/evolution/:connectionId
```

Akış:

1. connection ID lookup
2. secret/signature/token validation (mevcut provider imkanına göre)
3. payload validation
4. raw event id oluştur
5. idempotency/dedupe
6. persist webhook event
7. 2xx quickly
8. async processing
9. business event üret
10. gerekirse n8n’e event ilet

Webhook doğrudan bütün business logic’i n8n’de çalıştırmamalıdır.

---

# 36. Webhook Event Store

```text
webhook_events
- id
- provider
- connection_id
- business_id
- provider_event_id
- event_type
- payload
- received_at
- processed_at
- status
- attempts
- error
```

`provider_event_id` veya hash ile unique dedupe.

---

# 37. n8n Rolü

n8n aşağıdaki workflow’lar için kullanılabilir.

## WF-01 Welcome

Trigger:

```text
customer.created
```

Action:

- welcome WhatsApp
- loyalty intro
- order link
- vCard

## WF-02 Order Accepted

```text
order.accepted
```

→ WhatsApp confirmation.

## WF-03 Order Status

state event → WhatsApp message.

## WF-04 New Order Telegram

```text
order.created
```

→ Telegram restaurant group.

## WF-05 Reward Earned

```text
loyalty.reward_earned
```

→ WhatsApp notification.

## WF-06 Abandoned Cart

schedule/trigger:

```text
cart.abandoned
```

Consent check Core API tarafından yapılır.

## WF-07 At Risk Customer

```text
customer.segment_changed → AT_RISK
```

campaign eligibility.

## WF-08 Day’s Pizza

campaign scheduled delivery.

## WF-09 Daily Owner Report

Restaurant local timezone sabah.

## WF-10 Weekly Owner Report

- revenue
- orders
- returning
- top products
- campaigns
- loyalty

## WF-11 Integration Alert

Evolution disconnected → owner/super admin alert.

## WF-12 Printer Alert

printer offline > configured threshold → owner alert.

---

# 38. Event Bus / Outbox

Core transaction ile event aynı atomik DB transaction içinde yazılmalıdır.

```text
outbox_events
- id
- business_id
- event_type
- aggregate_type
- aggregate_id
- payload
- created_at
- published_at
- attempts
```

Worker:

```text
DB Outbox
 ↓
internal subscribers
 ↓
n8n webhook
 ↓
Telegram / Evolution / other
```

n8n geçici olarak down olsa bile event kaybolmaz.

---

# 39. Customer 360 CRM

Restaurant owner müşteri profili:

## Header

- Name
- Phone
- Status
- Segment
- Loyalty
- Available reward
- Last order

## Metrics

- First seen
- Acquisition source
- Orders
- Revenue
- AOV
- Last order date
- Days since last order
- Favorite product
- Favorite category
- Preferred fulfillment
- Preferred branch
- campaign conversion
- lifetime loyalty earned
- rewards redeemed

## Timeline

```text
customer.created
marketing.opt_in
order.placed
loyalty.earned
campaign.clicked
reward.earned
reward.redeemed
order.delivered
```

---

# 40. Customer Segmentation

## RFM

Recency / Frequency / Monetary.

Segments:

- Champions
- VIP
- Loyal
- Potential Loyal
- New
- Promising
- At Risk
- Sleeping
- Lost

Threshold restaurant size’a göre configurable olabilir.

## Behavioral

- Pepperoni Lovers
- Vegetarian
- High Basket
- Coupon Sensitive
- Delivery Only
- Pickup Only
- Lunch Customers
- Late Night Customers
- Weekend Customers
- Frequent Buyer
- Reward Heavy User
- Abandoned Cart
- No Order After Signup

Segment query builder gelecekte generic olmalıdır.

---

# 41. Marketing Campaign Builder

Restaurant Marketing/Owner:

## Audience

- saved segment
- custom filters
- branch
- acquisition source
- order count
- spend
- recency
- product affinity
- loyalty state
- reward state
- consent

## Offer

- coupon
- product discount
- category discount
- free item
- double points
- double stamps
- fixed amount
- delivery discount

## Channel

İlk:

- WhatsApp

Daha sonra:

- Email
- SMS
- Push

## Schedule

- now
- date/time
- recurring
- event based

---

# 42. Campaign Safety

- marketing consent mandatory
- per-business frequency cap
- quiet hours
- suppression list
- opt-out always respected
- send rate limits
- duplicate suppression
- campaign idempotency
- test send
- preview
- audience count
- owner confirmation

---

# 43. Günün Pizzası

Restaurant admin:

```text
Product
Campaign Price
Start
End
Branch
Stock/availability
Optional loyalty multiplier
```

Publishes to:

- storefront hero
- WhatsApp campaign
- dashboard
- QR landing
- optional social export

Track:

- impressions
- clicks
- add to cart
- orders
- revenue
- unique customers

---

# 44. Abandoned Cart

Definition example:

```text
cart updated
AND not checked out
AND > 30 minutes
```

Not every abandoned cart automatically gets a message.

Eligibility:

- marketing permission / applicable legal policy
- not already contacted
- not ordered afterward
- frequency cap
- restaurant campaign active

Analytics:

- abandoned carts
- recovery messages
- recovered carts
- recovered revenue

---

# 45. Coupon Engine

```text
coupons
coupon_rules
coupon_redemptions
```

Support:

- fixed
- percent
- product
- category
- delivery
- first order
- min spend
- max discount
- branch
- usage limit
- per customer limit
- start/end
- segment only

Coupon calculation Core API.

---

# 46. Payments

Payment adapter interface:

```text
createPayment()
verifyWebhook()
capture()
refund()
getStatus()
```

Initial offline methods:

- cash
- card on delivery
- restaurant payment

Online provider later.

Payment secrets restaurant-specific veya platform-level olabilir.

---

# 47. SaaS Billing

Restaurant platformu kullandığı için ayrı subscription module gerekir.

```text
plans
subscriptions
subscription_events
usage_counters
invoices
```

Plan feature flags:

- max branches
- max staff
- WhatsApp
- loyalty
- campaigns
- analytics
- printer
- KDS
- advanced segmentation

Super Admin planları yönetir.

İlk sürümde billing manuel olabilir; architecture hazır olmalıdır.

---

# 48. Analytics Event Taxonomy

Event table veya analytics pipeline:

```text
analytics_events
```

Temel event’ler:

```text
qr.scanned
whatsapp.join_started
customer.created
customer.opted_in

storefront.viewed
product.viewed
product.added_to_cart
cart.started
cart.abandoned
checkout.started

order.placed
order.accepted
order.delivered
order.cancelled

loyalty.earned
loyalty.reward_earned
loyalty.reward_redeemed

campaign.sent
campaign.delivered
campaign.clicked
campaign.converted

upsell.impression
upsell.accepted
```

Her event:

- event_id
- business_id
- branch_id
- customer_id nullable
- session_id
- source
- campaign_id
- timestamp
- metadata

---

# 49. Restaurant Analytics

## Sales

- Gross Revenue
- Net Revenue
- Orders
- AOV
- items/order
- cancellations
- refunds
- delivery fees
- discount total

## Customer

- total
- new
- active
- returning
- repeat rate
- inactive
- lost
- revenue/customer
- orders/customer

## Retention

- D7
- D30
- D60
- cohort retention
- repeat purchase interval

## LTV

- historical LTV
- predicted LTV optional
- LTV by acquisition source
- LTV loyalty vs non-loyalty

## Loyalty

- membership rate
- earn rate
- reward earn rate
- redemption rate
- average time to reward
- loyalty revenue
- loyalty vs non-loyalty AOV
- loyalty vs non-loyalty frequency

## Products

- units sold
- revenue
- margin
- attach rate
- category share
- top combinations
- modifier popularity
- product time-of-day

## Marketing

- audience
- sent
- delivered
- clicked
- orders
- conversion
- revenue
- revenue per recipient
- coupon cost
- campaign ROAS-like metric

## Operations

- acceptance time
- prep time
- ready time
- delivery time
- cancellation by reason
- printer failures

---

# 50. Cohort Analytics

Örnek:

```text
First Order Month | M0 | M1 | M2 | M3
Jan               |100 | 38 | 27 | 22
Feb               |100 | 41 | 30 |
Mar               |100 | 44 |
```

Filters:

- branch
- source
- loyalty member
- first product/category
- campaign

---

# 51. Menu Engineering

Ürün maliyeti girilebiliyorsa:

- Star
- Plowhorse
- Puzzle
- Dog

hesaplanabilir.

Metrics:

- quantity
- revenue
- gross margin
- popularity
- contribution margin

---

# 52. Super Admin Analytics

Platform wide:

- GMV
- total orders
- active restaurants
- active restaurant ratio
- median restaurant GMV
- restaurant retention
- restaurant churn
- feature adoption
- WhatsApp adoption
- loyalty adoption
- campaign adoption
- printer adoption
- error rate
- webhook throughput
- message throughput

Cohort:

- restaurant signup cohort
- trial conversion
- 30d restaurant retention

---

# 53. Audit Log

Her hassas admin action:

```text
audit_logs
- id
- business_id nullable
- actor_user_id
- actor_role
- action
- entity_type
- entity_id
- before_json
- after_json
- ip
- user_agent
- created_at
```

Zorunlu action’lar:

- loyalty manual adjustment
- reward manual redeem
- order cancellation
- refund
- role changes
- tenant impersonation
- integration secret change
- subscription change

---

# 54. Güvenlik

## Auth

- secure sessions veya JWT + refresh strategy
- HttpOnly
- Secure
- SameSite
- CSRF strategy
- password hashing Argon2id
- 2FA super admin için tavsiye

## Authorization

Her query tenant scoped.

Asla client’tan gelen `business_id`’ye güvenme.

Server session’dan business context türet.

## Secrets

- Git’e secret commit etme
- `.env` gitignored
- `.env.example` sadece placeholder
- production secrets secret manager/env
- DB’de integration token encryption-at-rest
- master encryption key env’de

## Rate limiting

- login
- public storefront
- checkout
- loyalty claim
- webhooks
- coupon apply
- password reset

## Input validation

Zod schema tüm API boundaries.

## SQL

ORM param binding; raw query gerekirse parameterized.

---

# 55. Idempotency

Zorunlu alanlar:

- order submit
- payment webhook
- Evolution webhook
- loyalty claim
- reward redeem
- Telegram callbacks
- n8n callbacks
- print ack

Tablo:

```text
idempotency_keys
- scope
- key
- response_hash
- resource_id
- expires_at
```

---

# 56. Race Conditions

Loyalty token:

```sql
UPDATE claim_tokens
SET consumed_at = NOW(), consumed_by_customer_id = $customer
WHERE id = $id
  AND consumed_at IS NULL
  AND expires_at > NOW()
RETURNING id;
```

Sadece row dönerse loyalty earn.

Reward redeem aynı atomik mantık.

Stock/availability gerekiyorsa row lock/versioning.

---

# 57. Database Backups

Production minimum:

- automated daily backup
- retention policy
- off-server/off-provider backup
- restore test
- RPO/RTO document

Backup var demek yetmez; restore testi yapılmalıdır.

---

# 58. Logging ve Monitoring

## Health

```text
GET /health/live
GET /health/ready
```

Check:

- app
- DB
- Redis
- queue/outbox lag

## Integration health

- Evolution
- n8n
- Telegram
- printer
- payment

## Error observability

- structured logs
- correlation ID
- request ID
- business ID
- order ID
- webhook event ID

Sensitive payload masking zorunlu.

---

# 59. Infrastructure

Minimum production components:

```text
Reverse Proxy
Web App
API
Worker
PostgreSQL
Redis
n8n
Evolution API
Object Storage
```

Docker Compose başlangıçta yeterlidir.

Büyüyünce ayrı host/container orchestration yapılabilir.

## HTTPS

Public endpoint’lerin tamamı HTTPS.

Gerekli public endpoints:

- app
- storefront
- API
- Evolution webhook
- n8n webhook
- payment webhook

---

# 60. Domain Planı

Örnek:

```text
domain.com                 Landing
app.domain.com             Admin
api.domain.com             Core API
order.domain.com/r/...     Storefront
n8n.domain.com             n8n
evo.domain.com             Evolution API
```

n8n ve Evolution admin UI mümkünse IP/VPN/auth arkasında korunmalıdır.

---

# 61. Restaurant WhatsApp Modeli

Üretimde önerilen:

```text
Restaurant A → Evolution Instance A → WhatsApp Number A
Restaurant B → Evolution Instance B → WhatsApp Number B
Restaurant C → Evolution Instance C → WhatsApp Number C
```

Platform DB integration mapping ile doğru tenant’ı bulur.

Restaurant onboarding’de QR ile WhatsApp bağlantısı yapılabilir.

Connection state Super Admin ve restaurant integrations ekranında görünür.

---

# 62. Gerekli Hesaplar / API Keyler / Credential Checklist

Aşağıdaki listede **zorunlu**, **opsiyonel** ve **ileride** ayrımı yapılmıştır.

## 62.1 Zorunlu — Domain / Hosting

Sağlanacak:

```text
PRIMARY_DOMAIN=
APP_DOMAIN=
API_DOMAIN=
ORDER_DOMAIN=
```

Ayrıca:

- DNS erişimi
- reverse proxy erişimi
- SSL
- production server SSH/deploy erişimi

AI’a raw production root password vermek yerine mümkünse sınırlı deploy hesabı ver.

---

## 62.2 Zorunlu — PostgreSQL

```text
DATABASE_URL=
```

AI’a geliştirme için ayrı development DB ver.

Production DB secret yalnız deployment environment’ta tutulmalı.

---

## 62.3 Zorunlu — Redis

```text
REDIS_URL=
```

Kullanım:

- rate limiting
- queue
- cache
- transient locks
- session opsiyonel

---

## 62.4 Zorunlu — Auth Secrets

```text
SESSION_SECRET=
JWT_SECRET=
REFRESH_TOKEN_SECRET=
PASSWORD_RESET_SECRET=
```

Hepsi high-entropy random.

Kullanılan auth modeline göre gereksiz olanlar kaldırılabilir.

---

## 62.5 Zorunlu — App Encryption

Restaurant integration API key’lerini DB’de encrypted tutmak için:

```text
APP_ENCRYPTION_KEY=
```

Rotation stratejisi dokümante edilmeli.

---

## 62.6 Zorunlu — Evolution API

Platform-level:

```text
EVOLUTION_BASE_URL=
EVOLUTION_GLOBAL_API_KEY=
```

Restaurant connection’ları için DB’ye encrypted biçimde:

```text
instance_name
instance_token/api_key
phone
```

kaydedilir.

Evolution deployment’ında global auth key ayrı tutulur.

Beklenen kabiliyetler:

- instance create/connect
- instance state
- webhook set/get
- incoming message event
- send text

---

## 62.7 Zorunlu — n8n

```text
N8N_BASE_URL=
N8N_API_KEY=         # sadece API ile workflow yönetilecekse
N8N_INBOUND_SECRET=  # app → n8n webhook auth
N8N_CALLBACK_SECRET= # n8n → app callback auth
```

n8n kendi credential store içinde:

- Evolution credential
- Telegram credential
- diğer provider credentials

tutabilir.

Prod n8n’de credentials export edilmemelidir.

---

## 62.8 Telegram — Restaurant bazlı opsiyonel ama önerilir

Platform ortak bot kullanacaksa:

```text
TELEGRAM_BOT_TOKEN=
```

Restaurant DB:

```text
telegram_chat_id
telegram_thread_id optional
```

Alternatif her restaurant kendi botunu bağlayabilir; ilk sürümde ortak bot + farklı chat daha basittir.

---

## 62.9 Object Storage

Ürün fotoğrafları/logo için.

S3-compatible:

```text
S3_ENDPOINT=
S3_REGION=
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_PUBLIC_BASE_URL=
```

Cloudflare R2 / AWS S3 / MinIO vb.

---

## 62.10 Email

Owner invite, reset password vb. için.

```text
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
```

veya transactional email provider API key.

WhatsApp email’i tamamen ortadan kaldırmaz; account recovery için email faydalıdır.

---

## 62.11 Error Monitoring

Opsiyonel ama üretimde tavsiye:

```text
SENTRY_DSN=
```

---

## 62.12 Analytics

Landing + product analytics.

Tek sağlayıcı seç:

```text
POSTHOG_KEY=
POSTHOG_HOST=
```

veya GA/Plausible.

İlk sürüm için self-owned DB analytics zaten şarttır; üçüncü taraf analytics sadece UI/product analytics içindir.

---

## 62.13 Maps / Geocoding

Delivery zone / address autocomplete istenirse:

```text
GOOGLE_MAPS_API_KEY=
```

veya alternatif provider.

İlk MVP için zorunlu değildir.

---

## 62.14 Online Payment

Provider seçildikten sonra restaurant veya platform bazlı:

```text
PAYMENT_PROVIDER=
PAYMENT_API_KEY=
PAYMENT_SECRET=
PAYMENT_WEBHOOK_SECRET=
```

İlk sürüm offline payment ile başlayabilir.

---

## 62.15 SaaS Subscription Payment

Restaurantlardan otomatik abonelik tahsil edilecekse ayrı provider gerekebilir.

```text
BILLING_PROVIDER=
BILLING_API_KEY=
BILLING_SECRET=
BILLING_WEBHOOK_SECRET=
```

Restaurant order payment ile SaaS billing aynı provider olmak zorunda değildir.

---

## 62.16 Printer Agent

Her device için server-generated credential:

```text
PRINT_AGENT_DEVICE_ID=
PRINT_AGENT_TOKEN=
PRINT_AGENT_API_URL=
```

Global secret kullanılmamalı.

Her cihaz ayrı revoke edilebilir token almalı.

---

## 62.17 Git / Repository

AI’a:

- repository path
- branch strategy
- GitHub repo erişimi gerekiyorsa
- issue/project convention

ver.

Secret PAT’i repo içine yazdırma.

---

# 63. AI’a Gerçekte Neleri Vermelisin?

AI coding agent’ın projeyi yapabilmesi için aşağıdaki “handoff package” yeterli olmalıdır.

## A. Bu master plan

```text
docs/RESTAURANT_OS_MASTER_PLAN.md
```

## B. AGENTS.md

Repo root’ta:

```text
AGENTS.md
```

Aşağıdaki kuralları içermeli:

- master plan source of truth
- no Hermes
- n8n only automation
- core business logic API
- multi-tenant mandatory
- TypeScript strict
- tests required
- secrets never committed
- migrations required
- tenant isolation test mandatory
- audit sensitive changes
- update docs after architecture changes

## C. Environment placeholders

```text
.env.example
```

Gerçek secret yok.

## D. Development secrets

AI’ın local/dev environment’ı çalıştırması için ayrı `.env.local`.

Production secret verme zorunluluğu yok.

## E. Brand decisions

- product name
- logo
- colors
- preferred domain
- landing tone
- target restaurant profile
- desired pricing if known

Bunlar yoksa AI sensible placeholder kullanabilir.

## F. Infrastructure access

AI deployment da yapacaksa:

- server SSH
- Docker
- DNS access veya DNS kayıtlarını senin oluşturacağın bilgi
- Evolution URL
- n8n URL
- DB/Redis

## G. Sample restaurant

AI test edebilmesi için demo tenant:

```text
Restaurant: Mario Pizza Demo
Branch: Florya
Currency: TRY
Timezone: Europe/Istanbul
```

Demo menu:

- Margherita
- Pepperoni
- Karışık
- 4 Peynirli
- Patates
- Cola
- Ayran
- San Sebastian

Variants/modifiers eklenmeli.

## H. Acceptance criteria

Bu dokümandaki acceptance checklist.

---

# 64. AI’a Vermemen Gereken Şeyler

Repo içine veya prompt’a kalıcı plaintext olarak:

- production DB password
- production Evolution master key
- SMTP password
- payment secret
- root SSH password
- Cloudflare global key
- customer PII exports

yazma.

AI geliştirme için development secrets kullanmalı.

Production secret gerekiyorsa environment/secret store’da önceden tanımlı olsun.

---

# 65. `.env.example` Önerisi

```dotenv
NODE_ENV=development

# App
APP_NAME=restaurant-os
APP_URL=http://localhost:3000
ADMIN_URL=http://localhost:3000
STOREFRONT_URL=http://localhost:3001
API_URL=http://localhost:4000

# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/restaurant_os

# Redis
REDIS_URL=redis://localhost:6379

# Security
SESSION_SECRET=change-me
APP_ENCRYPTION_KEY=change-me
PASSWORD_RESET_SECRET=change-me

# Evolution
EVOLUTION_BASE_URL=http://localhost:8080
EVOLUTION_GLOBAL_API_KEY=change-me

# n8n
N8N_BASE_URL=http://localhost:5678
N8N_API_KEY=
N8N_INBOUND_SECRET=change-me
N8N_CALLBACK_SECRET=change-me

# Telegram
TELEGRAM_BOT_TOKEN=

# Object storage
S3_ENDPOINT=
S3_REGION=
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_PUBLIC_BASE_URL=

# Email
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=

# Monitoring
SENTRY_DSN=

# Product Analytics
POSTHOG_KEY=
POSTHOG_HOST=

# Maps
GOOGLE_MAPS_API_KEY=

# Payment
PAYMENT_PROVIDER=
PAYMENT_API_KEY=
PAYMENT_SECRET=
PAYMENT_WEBHOOK_SECRET=

# SaaS billing
BILLING_PROVIDER=
BILLING_API_KEY=
BILLING_SECRET=
BILLING_WEBHOOK_SECRET=
```

Not:

- gerçek key değerleri `.env.example` içine konulmaz.
- `.env*` gitignore policy dikkatle yapılır; `.env.example` commit edilir.

---

# 66. Önerilen Monorepo Yapısı

```text
restaurant-os/
├── AGENTS.md
├── README.md
├── .env.example
├── docker-compose.yml
├── package.json
├── pnpm-workspace.yaml
│
├── apps/
│   ├── admin/
│   ├── storefront/
│   ├── api/
│   ├── worker/
│   └── print-agent/
│
├── packages/
│   ├── db/
│   ├── auth/
│   ├── domain/
│   ├── ui/
│   ├── contracts/
│   ├── analytics/
│   ├── integrations/
│   └── config/
│
├── integrations/
│   ├── evolution/
│   ├── n8n/
│   ├── telegram/
│   ├── payments/
│   └── storage/
│
├── n8n/
│   ├── workflows/
│   └── README.md
│
├── docs/
│   ├── RESTAURANT_OS_MASTER_PLAN.md
│   ├── ARCHITECTURE.md
│   ├── DATABASE.md
│   ├── EVENTS.md
│   ├── SECURITY.md
│   ├── N8N.md
│   ├── EVOLUTION.md
│   ├── PRINTER_AGENT.md
│   ├── ANALYTICS.md
│   ├── DEPLOYMENT.md
│   ├── DECISIONS.md
│   └── CHANGELOG.md
│
└── tests/
    ├── e2e/
    └── fixtures/
```

---

# 67. Obsidian Kullanımı

Proje dizini Obsidian vault içinde olabilir.

Önerilen docs yapısı doğrudan Obsidian’da okunabilir.

## Ana dosyalar

```text
docs/RESTAURANT_OS_MASTER_PLAN.md
docs/DECISIONS.md
docs/ARCHITECTURE.md
docs/CHANGELOG.md
```

## Obsidian links

Dokümanlar:

```text
[[RESTAURANT_OS_MASTER_PLAN]]
[[ARCHITECTURE]]
[[DATABASE]]
[[EVENTS]]
[[SECURITY]]
```

şeklinde cross-link edilebilir.

## Tavsiye

Her büyük architecture kararı `DECISIONS.md` içine:

```text
## ADR-001 — n8n business logic çalıştırmayacak
Date:
Status: Accepted

Context:
Decision:
Consequences:
```

biçiminde yazılsın.

---

# 68. `opencode-mem` Kullanımı

Projede `opencode-mem` bulunduğu için agent:

1. Bu master dokümanı başlangıçta okumalı.
2. Önceki proje kararlarını memory’den çekmeli.
3. Yeni karar verilirse memory + `docs/DECISIONS.md` güncellenmeli.
4. Memory, source of truth yerine geçmemeli.
5. Source of truth her zaman repository içindeki docs + code olmalı.
6. Memory’deki bilgi repo dokümanı ile çelişirse repo dokümanı esas alınmalı.
7. Secret/API key kesinlikle memory’ye yazılmamalı.
8. Müşteri PII memory’ye yazılmamalı.

---

# 69. AGENTS.md İçeriği İçin Talimat

Repo root `AGENTS.md` aşağıdaki prensipleri açıkça belirtmelidir:

```text
1. Read docs/RESTAURANT_OS_MASTER_PLAN.md before architecture work.
2. Read docs/DECISIONS.md before changing architecture.
3. This is a multi-tenant SaaS.
4. Never bypass tenant scoping.
5. Never put core business logic in n8n.
6. No Hermes/LLM runtime dependency.
7. Evolution API is the WhatsApp provider abstraction's initial implementation.
8. All external callbacks are idempotent.
9. Use transactional outbox for durable external side effects.
10. Loyalty/reward/payment/order mutations require transactions.
11. Sensitive mutations require audit logs.
12. Secrets must never be committed or written to memory/docs.
13. Add tests for every bug fixed.
14. Tenant isolation must have integration tests.
15. DB schema changes require migrations.
16. APIs require schema validation.
17. Keep OpenAPI contracts updated.
18. Update docs when behavior changes.
19. Do not silently change accepted product requirements.
20. Prefer boring, reliable infrastructure over unnecessary complexity.
```

---

# 70. Core Database Tables

Minimum production schema:

```text
platform_users
businesses
branches
business_users
roles
permissions

plans
subscriptions
feature_flags

customers
customer_addresses
customer_consents
customer_tags
customer_segments

menus
categories
products
product_variants
modifier_groups
modifiers
product_branch_availability

carts
cart_items
cart_item_modifiers

orders
order_items
order_item_modifiers
order_adjustments
order_events

payments
refunds

loyalty_programs
loyalty_accounts
loyalty_transactions
loyalty_claim_tokens
reward_rules
rewards

coupons
coupon_redemptions

campaigns
campaign_audiences
campaign_messages
campaign_events

qr_codes
acquisition_events

integration_connections
webhook_events

print_devices
print_jobs

analytics_events

outbox_events
idempotency_keys
audit_logs
```

---

# 71. API Modülleri

```text
/auth
/platform
/businesses
/branches
/users
/customers
/menus
/products
/carts
/orders
/payments
/loyalty
/rewards
/coupons
/campaigns
/segments
/analytics
/qr
/integrations
/printers
/webhooks
/billing
/health
```

---

# 72. API Contract Prensipleri

- `/v1`
- OpenAPI
- Zod
- typed client
- consistent error envelope

Örnek error:

```json
{
  "error": {
    "code": "LOYALTY_TOKEN_ALREADY_USED",
    "message": "This loyalty token has already been used.",
    "requestId": "..."
  }
}
```

Error codes frontend/business logic için stabil olmalı.

---

# 73. Public vs Authenticated API

## Public

- restaurant storefront read
- product/menu read
- cart session
- checkout
- customer session verify
- QR redirects

## Restaurant Auth

- restaurant dashboard
- CRM
- campaigns
- orders
- analytics
- settings

## Platform Auth

- all tenants
- plans
- tenant controls
- platform analytics

## Integration

- Evolution webhooks
- payment webhooks
- n8n callbacks
- printer agent
- Telegram callbacks

Her integration endpoint ayrı auth modeline sahip olabilir.

---

# 74. QR Registry

Her QR kayıtlı entity olmalı.

```text
qr_codes
- id
- business_id
- branch_id
- type
- source
- campaign_id
- table_number
- active
- created_at
```

Types:

```text
ACQUISITION
LOYALTY_STATIC_ENTRY
TABLE
ORDER
CAMPAIGN
```

Single-use loyalty claim QR için ayrı secure token tablosu kullanılmalıdır.

Analytics:

```text
scan count
customer conversion
order conversion
revenue
```

---

# 75. Restaurant Table Mode

Restaurant dine-in istiyorsa:

```text
/r/mario?table=12&token=...
```

Table session:

- table known
- order dine-in
- kitchen print
- waiter optional

Bu modül ilk production milestone sonrası eklenebilir ama architecture engellememeli.

---

# 76. Menu Import

Restaurant onboarding hızlandırmak için:

1. CSV/XLSX import
2. manual
3. future POS import

CSV columns:

```text
category
product
description
variant
price
modifier_group
modifier
modifier_price
```

Import preview ve validation zorunlu.

---

# 77. Restaurant Data Export

Owner kendi verilerini export edebilmeli:

- customers
- orders
- loyalty
- products
- campaign results

CSV.

PII export audit log’a yazılmalıdır.

---

# 78. Data Deletion / Retention

Business kapandığında:

- suspend first
- export opportunity
- retention window
- delete/anonymize policy

Customer deletion/anonymization workflow da tasarlanmalıdır.

---

# 79. Feature Flags

Platform:

```text
LOYALTY
CAMPAIGNS
ADVANCED_ANALYTICS
PRINTER
KDS
ONLINE_PAYMENT
MULTI_BRANCH
```

Business planına göre feature gate.

Backend gate zorunlu; frontend hide tek başına güvenlik değildir.

---

# 80. Development Environments

Minimum:

```text
local
staging
production
```

Staging:

- ayrı DB
- ayrı Redis
- ayrı Evolution test instance mümkünse
- ayrı n8n workflow environment/instance
- test Telegram chat

Production data staging’e kopyalanmamalı.

---

# 81. n8n Environment Notu

n8n prod workflow’larını gelişigüzel canlıda düzenlememek gerekir.

Mümkün olduğunca:

- dev workflow
- exported JSON
- version control
- production import/deploy

Credentials workflow export içine plaintext girmemelidir.

---

# 82. Test Planı

## Unit

- price calculator
- coupon
- loyalty rules
- RFM
- state transitions
- delivery fee
- permission policies

## Integration

- DB transaction
- tenant isolation
- order create
- loyalty claim
- reward redeem
- webhook dedupe
- outbox
- campaign eligibility

## E2E

Customer:

```text
QR join
→ customer created
→ order
→ loyalty earned
→ reward
```

Restaurant:

```text
login
→ product
→ order accept
→ printer/telegram
```

Super Admin:

```text
tenant create
→ owner invite
→ suspend
```

---

# 83. Kritik Security Testleri

Zorunlu:

1. Restaurant A user Restaurant B order ID tahmin ederek okuyamamalı.
2. Restaurant A customer export Restaurant B verisi içermemeli.
3. Cross-tenant campaign mümkün olmamalı.
4. Cross-tenant loyalty claim yasak.
5. Super admin endpoint owner tarafından erişilemez.
6. Expired signed storefront token reject.
7. reused loyalty token reject.
8. duplicate webhook tek işlem.
9. duplicate order submit tek order.
10. printer agent başka branch job alamaz.

---

# 84. Performance

İlk hedefler:

- P95 API read < 300 ms normal load
- checkout/order creation < 1 s provider dışı
- webhook ack hızlı
- external provider çağrıları request transaction’ını gereksiz yere bloklamaz
- dashboard heavy analytics pre-aggregation/cache kullanabilir

---

# 85. Analytics Aggregation

İlk veri küçükken SQL views yeterli.

Büyüyünce:

```text
daily_business_metrics
daily_branch_metrics
daily_product_metrics
daily_customer_metrics
campaign_metrics
```

materialized aggregation tabloları.

Dashboard her zaman raw millions events taramamalı.

---

# 86. Restaurant Owner Daily Report

Örnek:

```text
DÜN

Ciro: 31.842₺
Sipariş: 83
Ort. Sepet: 383₺

Yeni Müşteri: 18
Tekrar Müşteri: 37

En Çok Satan:
Pepperoni

En Yoğun Saat:
20:00–21:00

Sadakat:
31 puan/damga
4 ödül kullanımı

Kampanya Geliri:
5.220₺
```

n8n scheduled workflow.

No AI required.

---

# 87. Landing Page Lead Flow

Restaurant owner CTA:

```text
Demo İste
```

Form:

- restaurant name
- contact name
- phone
- city
- branch count
- current order channels
- WhatsApp
- monthly approximate orders optional

Lead:

```text
platform_leads
```

tablosuna.

Super Admin CRM-lite:

- new
- contacted
- demo
- trial
- won
- lost

Bu modül platform sales için faydalıdır.

---

# 88. Demo Mode

Landing page’de public demo restaurant.

```text
Mario Pizza Demo
```

Visitor:

- storefront deneyebilir
- mock loyalty
- admin screenshots

Gerçek Telegram/WhatsApp spam yapmamalı.

---

# 89. SaaS Pricing Architecture

UI planlar configurable.

Örnek placeholder:

```text
Starter
Growth
Pro
```

Hardcode fiyat kullanma.

DB:

```text
plan_prices
```

ve Super Admin ayarı.

---

# 90. Restaurant Notification Preferences

Restaurant owner seçebilmeli:

- Telegram new orders
- WhatsApp integration alerts
- email billing
- daily report
- weekly report
- printer offline

---

# 91. Branding / White-label

Her restaurant:

- logo
- primary color
- cover image
- restaurant name
- favicon optional

Storefront dinamik branding.

Platform admin UI kendi SaaS markasını kullanır.

---

# 92. Accessibility / Mobile

Customer storefront mobile-first.

Restaurant owner dashboard responsive.

Kitchen tablet-friendly.

Kasiyer hızlı büyük buton.

Minimum:

- keyboard navigation
- contrast
- button touch targets
- loading/error states

---

# 93. Error UX

Müşteriye teknik hata göstermeyin.

Örnek:

> Siparişini şu anda tamamlayamadık. Sepetin kaydedildi. Lütfen tekrar dene.

Internal:

```text
request_id
```

log.

---

# 94. Offline / Degraded Operation

Evolution down:

- ordering devam eder
- WhatsApp notification queue’da kalır
- dashboard warning

n8n down:

- ordering devam eder
- outbox backlog

Printer offline:

- order devam eder
- Telegram/KDS alert
- print job pending

Telegram down:

- KDS/admin order screen devam eder

Bu ürün bir entegrasyon düştüğü için tamamen çökmez.

---

# 95. Geliştirme Fazları

## Phase 0 — Foundation

- monorepo
- lint
- test
- env validation
- Docker
- Postgres
- Redis
- CI
- migrations
- docs
- AGENTS.md

### Exit

Local stack tek komutla çalışır.

---

## Phase 1 — Identity + Multi-Tenant + Super Admin

- auth
- platform users
- business
- branch
- roles
- tenant isolation
- Super Admin dashboard skeleton
- Restaurant Owner shell
- audit

### Exit

Super Admin restaurant oluşturabilir; owner kendi tenant’ına girer ve başka tenant verisini göremez.

---

## Phase 2 — Menu + Storefront

- menu
- products
- variants
- modifiers
- images
- restaurant storefront
- availability
- cart

### Exit

Demo customer gerçek bir ürün sepeti oluşturabilir.

---

## Phase 3 — Order Engine

- checkout
- fulfillment
- address
- totals
- order snapshot
- state machine
- restaurant order dashboard

### Exit

Customer order verir, restaurant kabul eder, status ilerler.

---

## Phase 4 — Evolution + Customer CRM

- integration provider abstraction
- Evolution connection
- webhook ingestion
- message dedupe
- customer from phone
- acquisition QR
- welcome
- vCard
- Customer 360

### Exit

QR → WhatsApp → customer CRM akışı canlı çalışır.

---

## Phase 5 — Loyalty

- programs
- claim tokens
- ledger
- rewards
- redemption
- loyalty UI
- loyalty WhatsApp notification

### Exit

Single-use QR ile güvenli earn + reward yapılır.

---

## Phase 6 — n8n + Telegram + Printer

- outbox dispatch
- n8n workflows
- Telegram
- print jobs
- print agent
- integration health

### Exit

Order otomatik Telegram ve printer’a ulaşır; status WhatsApp mesajı üretir.

---

## Phase 7 — Campaigns + Segmentation

- consent
- RFM
- behavior
- campaign builder
- day’s pizza
- coupon
- winback
- abandoned cart

### Exit

Restaurant kontrollü segment campaign gönderip conversion ölçer.

---

## Phase 8 — Advanced Analytics

- sales
- customers
- retention
- cohorts
- LTV
- loyalty impact
- products
- menu engineering
- campaign attribution
- operational analytics
- cross-branch

### Exit

Restaurant owner karar vermeye yetecek dashboard’a sahip.

---

## Phase 9 — Platform SaaS

- plans
- subscriptions
- usage
- feature flags
- platform analytics
- lead management
- billing integration optional

### Exit

Yeni restaurant self-service veya Super Admin ile onboard edilebilir.

---

## Phase 10 — Hardening

- load tests
- security tests
- backup restore
- observability
- incident docs
- webhook replay
- retry UI
- data exports
- privacy workflows

---

# 96. Production Definition of Done

Bir feature “done” sayılmak için:

- business requirement complete
- tenant-safe
- validation
- auth
- test
- migration
- audit if sensitive
- error handling
- loading state
- monitoring
- docs
- no secrets
- responsive UI
- accessibility basic
- E2E critical path

---

# 97. İlk Canlı Pilot Acceptance

İlk restaurant pilotu için uçtan uca:

1. Super Admin restaurant oluşturur.
2. Owner invite olur.
3. Owner login.
4. Branch kurar.
5. Menu oluşturur/import eder.
6. Evolution WhatsApp bağlar.
7. Acquisition QR üretir.
8. Customer QR okutur.
9. Customer WhatsApp mesajı yollar.
10. CRM customer oluşur.
11. Welcome cevap gelir.
12. Customer order storefront açar.
13. Sepet oluşturur.
14. Checkout yapar.
15. Restaurant order görür.
16. Telegram bildirimi gelir.
17. Printer fiş basar.
18. Restaurant ACCEPTED yapar.
19. Customer WhatsApp status alır.
20. Order delivered.
21. Loyalty kazanır.
22. Puan/damga Customer 360’da görünür.
23. Reward threshold olursa reward yaratılır.
24. Reward redeem edilir.
25. Analytics aynı order/customer/loyalty olayını doğru sayar.
26. Super Admin tenant aktivitesini görür.
27. Restaurant B oluşturulduğunda iki tenant arasında data leakage olmaz.

---

# 98. AI Coding Agent İçin Çalışma Protokolü

Agent göreve başladığında:

## İlk

1. `AGENTS.md`
2. `docs/RESTAURANT_OS_MASTER_PLAN.md`
3. `docs/DECISIONS.md`
4. mevcut code
5. migrations
6. tests

okur.

## Her task

- existing implementation inspect
- plan
- smallest coherent change
- tests
- docs
- lint/typecheck
- report

## Agent kendi kendine şu kararları değiştirmemeli

- multi-tenant
- no Hermes
- critical logic outside n8n
- Evolution provider abstraction
- outbox
- ledger
- audit
- role model
- security boundaries

Değişiklik gerekirse `DECISIONS.md` ADR açılmalıdır.

---

# 99. AI’a Başlangıçta Vereceğin Bilgiler — Kopyala/Doldur

```text
PROJECT_NAME:
PRODUCT_BRAND_NAME:

REPO_PATH:
OBSIDIAN_VAULT_PATH:
OPENCODE_MEM_ENABLED: true

PRIMARY_DOMAIN:
APP_DOMAIN:
API_DOMAIN:
ORDER_DOMAIN:

DEPLOYMENT_SERVER:
DEPLOYMENT_METHOD: Docker Compose

DATABASE_URL_DEV:
REDIS_URL_DEV:

EVOLUTION_BASE_URL:
EVOLUTION_GLOBAL_API_KEY:
EVOLUTION_TEST_INSTANCE:

N8N_BASE_URL:
N8N_API_KEY:
N8N_INBOUND_SECRET:
N8N_CALLBACK_SECRET:

TELEGRAM_BOT_TOKEN:
TELEGRAM_TEST_CHAT_ID:

S3_ENDPOINT:
S3_REGION:
S3_BUCKET:
S3_ACCESS_KEY_ID:
S3_SECRET_ACCESS_KEY:

SMTP_HOST:
SMTP_PORT:
SMTP_USER:
SMTP_PASSWORD:
SMTP_FROM:

SENTRY_DSN:

ANALYTICS_PROVIDER:
ANALYTICS_KEY:

PAYMENT_PROVIDER:
PAYMENT_TEST_API_KEY:
PAYMENT_TEST_SECRET:

BILLING_PROVIDER:
BILLING_TEST_API_KEY:
BILLING_TEST_SECRET:

DEMO_RESTAURANT_NAME:
DEMO_RESTAURANT_PHONE:
DEMO_RESTAURANT_CITY:
DEMO_RESTAURANT_BRANCH:
```

Boş olan entegrasyonlar fake adapter ile geliştirilebilir ama production “ready” işaretlenmemelidir.

---

# 100. AI’a Verilecek İlk Master Talimat

Aşağıdaki metin OpenCode için başlangıç görevi olarak kullanılabilir:

> Bu repository `Restaurant OS` adlı multi-tenant restoran SaaS ürünüdür. Önce `AGENTS.md` ve `docs/RESTAURANT_OS_MASTER_PLAN.md` dosyalarını tamamen oku. `opencode-mem` kullanabilirsin ancak memory source of truth değildir; repository docs ve code source of truth’tur. Secret, API key veya müşteri PII bilgisini memory’ye veya dokümana yazma.
>
> Hermes veya runtime LLM kullanma. n8n yalnızca otomasyon ve entegrasyon orchestration için kullanılabilir. Sipariş, fiyat, loyalty, reward, coupon, payment, tenant authorization ve diğer kritik business logic Core API’de olmalıdır.
>
> Sistem en baştan multi-tenant olacak. Super Admin bütün restoranları yönetebilecek; restaurant owner yalnızca kendi tenant verisine erişebilecek. Her dış webhook/idempotent command tekrar güvenli olmalı. Loyalty ve reward işlemleri transaction + ledger mantığında kurulmalı. Dış side-effect’ler transactional outbox üzerinden yürümeli.
>
> Önce mevcut repository’yi incele, neyin var olduğunu çıkar, eksikleri Phase 0’dan başlayarak sırala. Her fazda migration, test, authorization, audit ve docs gereksinimlerini yerine getir. Büyük mimari kararı sessizce değiştirme; gerekirse `docs/DECISIONS.md` içine ADR ekle.
>
> Her aşamada çalışan, test edilebilir ve deploy edilebilir sistem üret. Demo/placeholder kodu production-ready diye işaretleme. Tenant isolation testlerini kritik kabul et.

---

# 101. AI’a Sağlanacak Örnek Demo Verisi

```text
Business:
Mario Pizza Demo

Branch:
Florya

Currency:
TRY

Timezone:
Europe/Istanbul

Loyalty:
10 stamps → 1 free standard pizza
Welcome bonus: 1

Products:

Pizzalar
- Margherita
- Pepperoni
- Karışık
- 4 Peynirli

Yan Ürün
- Patates

İçecek
- Cola
- Ayran

Tatlı
- San Sebastian

Pizza variants:
- Small
- Medium
- Large

Modifier groups:
- Dough
- Extra Cheese
- Extra Meat
- Sauce
```

---

# 102. Excluded Runtime Components

Bu proje planından çıkarılmıştır:

- Hermes
- runtime LLM dependency
- AI campaign generation zorunluluğu
- AI analytics interpretation zorunluluğu

İleride AI eklenmek istenirse ayrı optional module olarak eklenebilir; core ürün AI olmadan tam çalışmalıdır.

---

# 103. İlk Aşamada Opsiyonel / Daha Sonra

- native iOS/Android app
- courier mobile app
- advanced routing
- inventory management
- procurement
- accounting
- employee scheduling
- POS hardware integration
- external marketplace sync
- dynamic AI campaign generation
- recommendation ML
- full warehouse
- franchise royalty accounting

Mimari bunları engellememeli ancak ilk ürün kapsamını şişirmemeli.

---

# 104. Kaynak Doğrulama Notları

Evolution API için geliştirme öncesinde deploy edilen sürümün gerçek endpoint ve payload’ları staging’de doğrulanmalıdır.

Resmi Evolution kaynaklarında özellikle kontrol edilecek başlıklar:

- `evolution-foundation/evolution-api` repository `.env.example`
- Evolution webhook configuration
- `MESSAGES_UPSERT`
- instance create/connect
- webhook set/get
- send text endpoint
- authentication API key

n8n için:

- self-host security
- credential isolation
- webhook security
- reverse proxy/public webhook URL
- workflow versioning
- security audit

External provider entegrasyonları adapter arkasında tutulduğu için provider version değişiklikleri core domain’i değiştirmemelidir.

---

# 105. Nihai Mimari Karar Özeti

| Konu | Karar |
|---|---|
| Ürün tipi | Multi-tenant Restaurant SaaS |
| Platform yöneticisi | Super Admin |
| Restaurant kullanıcıları | Owner + Staff Roles |
| WhatsApp | Evolution API |
| WhatsApp instance | Tercihen restaurant başına ayrı |
| Automation | n8n |
| Runtime AI | Yok |
| Backend | TypeScript + Fastify |
| DB | PostgreSQL |
| Cache/Queue | Redis |
| Critical business logic | Core API |
| Durable side effects | Transactional Outbox |
| Loyalty | Ledger + atomic claim |
| Ordering | First-party storefront |
| Restaurant notification | Telegram optional |
| Kitchen printing | Local Print Agent |
| Analytics | First-party event + aggregate |
| Marketing | Consent-aware segmentation/campaign |
| Tenant security | Mandatory server-side isolation |
| Project docs | Markdown / Obsidian |
| Agent memory | opencode-mem; no secrets/PII |
| Source of truth | Repository code + docs |

---

# 106. Başarı Kriteri

Ürün başarılı sayılacaksa restaurant sahibi şunları tek sistemde yapabilmelidir:

- müşteriyi QR/WhatsApp ile kazanmak
- müşteriyi tanımak
- müşterinin tekrar gelmesini sağlamak
- doğrudan sipariş almak
- restaurant operasyonuna otomatik iletmek
- müşteriye otomatik durum bildirmek
- sadakat ödülü vermek
- tekrar sipariş kampanyası çalıştırmak
- müşteri segmentlerini görmek
- hangi kampanyanın para kazandırdığını görmek
- hangi ürünün/saatin/şubenin iyi çalıştığını görmek
- başka platformdan bağımsız kendi first-party customer database’ini büyütmek

Platform sahibi ise:

- bütün restaurant tenant’larını tek dashboard’dan görmek
- kullanım ve gelir metriklerini takip etmek
- bağlantı problemlerini görmek
- planları yönetmek
- support verebilmek
- sistemi yeni restaurantlara tekrar kuruluma gerek kalmadan açabilmek

olmalıdır.

---

# 107. Son Talimat

Geliştirme sırasında amaç “çok özellik göstermek” değil; **her özelliği tenant-safe, idempotent, gözlemlenebilir, audit edilebilir ve production-ready yapmak** olmalıdır.

Özellikle şu beş alan taviz verilmeden uygulanmalıdır:

1. Tenant isolation
2. Order/payment/loyalty transaction correctness
3. Webhook/idempotency reliability
4. Secret + PII security
5. Analytics event correctness

Bunlar ürünün gerçek omurgasıdır.
