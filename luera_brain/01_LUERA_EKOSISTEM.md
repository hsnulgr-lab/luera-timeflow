# 01 — LUERA AI Ekosistemi

## Vizyon

LUERA AI, işletmelerin operasyonel yükünü hedefli olarak azaltan, modüler bir SaaS
ekosistemidir. Her modül tek başına satılabilir, ama hepsi ortak bir omurgaya
(**LUERA Core**) bağlanır: kimlik, abonelik, olay akışı ve API anahtarları merkezde durur.

## Modüller

| Modül | İş | Canlı adres | Durum |
|---|---|---|---|
| **LeadFlow** | Lead toplama / takip | leadflow.lueratech.com | Canlı |
| **CallFlow** | AI sesli asistan / çağrı | callflow.lueratech.com | Canlı |
| **TimeFlow** | Randevu + operasyon yönetimi (bu proje) | timeflow.lueratech.com | Canlı, satışa hazır |
| **BrandFlow** | Marka / içerik | — | Planlı |
| **LinkFlow** | Bağlantı / entegrasyon | — | Planlı |
| **RunFlow** | Operasyon | — | Planlı |
| **CashFlow** | Finans | — | Planlı |
| **LUERA Core** | Omurga: multi-tenant, abonelik, gateway | core.lueratech.com | Canlı |

## Omurga (Core) 4 katmanı

1. **Multi-tenant** — `tenant_id` / `organization_id` + RLS her modülde aynı desen.
2. **Subscription** — Core'da `subscriptions` tablosu + `has_active_subscription(p_org_id, p_module_name)` RPC.
3. **Gateway** — modüller arası olay akışı (n8n): `POST https://n8n.vps.lueratech.com/webhook/gateway/v1/event`, `Authorization: Bearer luera_<env>_<32hex>`.
4. **Billing** — Dodo Payments (yalnız **SaaS aboneliği**; işletmenin kendi tahsilatı değil).

## Altyapı

| VPS | IP | İçerik |
|---|---|---|
| VPS 1 | 76.13.4.164 | LeadFlow + **TimeFlow Supabase** + Evolution (WhatsApp) |
| VPS 2 | 187.124.161.110 | CallFlow + n8n + LUERA Core |

- Tüm Supabase kurulumları **self-hosted** (Coolify üzerinde). Supabase Cloud projesi yok.
- Bunun en önemli sonucu: `supabase functions deploy` **çalışmaz**, `pg_cron` **kurulu değil**,
  edge runtime'da `VERIFY_JWT=false` (her fonksiyon kendi auth'unu yapar).

## Ticari durum (2026-08 itibarıyla)

- TimeFlow **satışa hazır** — 7 sektör işlevsel olarak doğrulandı.
- İlk hedef müşteri segmenti: **diş klinikleri**.
- İlk müşteriler **manuel sözleşme + elle faturalama** ile satılacak.
- Self-serve Dodo ödemesi bilinçli olarak **en son adım**.
- Abonelik kontrolü (gateway ENFORCE) **10. müşteriden önce** tamamlanmalı.
- Fiyat bandı (taslak): Başlangıç ₺299 / Pro ₺599 / İşletme ₺1.199 aylık.
  Dodo'da USD ürünler var (~48,5 TL/$ kurundan sabitlendi) — canlıya geçişte TRY kararı gerekli.

## Kapasite gerçeği

VPS 1'de 7.8 GB RAM'in ~6.5'i dolu. Bağlı her WhatsApp hattı ~80–150 MB.
**Mevcut donanımda tavan ≈ 8–10 müşteri.** Evolution'ı ayrı sunucuya taşımak
10. müşteriden önce gündeme gelmeli (ertelendi, plan hazır değil).
