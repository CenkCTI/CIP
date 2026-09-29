# CİTEM Source Reader PDF v2

## Amaç

PDF kaynaklarını tarayıcı iframe'inden bağımsız, CİTEM'e ait seçilebilir bir çalışma
yüzeyinde okumak; analist işaretlemelerini immutable kaynağın gerçek PDF koordinatlarına
bağlamak ve tek, deterministik bir işaretli çalışma PDF'si üretebilmek.

## Katmanlar

```
immutable ORIGINAL PDF
  -> PDF.js canvas
  -> PDF.js text layer
  -> CİTEM SVG annotation layer
  -> PDF-space annotation fragments
  -> pdf-lib burn-in
  -> real CİTEM front matter
  -> merged ANNOTATED_EXPORT
```

PDF.js yalnız okuma/render ve koordinat dönüşümü için kullanılır. CİTEM veritabanı
işaretlemelerin source of truth'udur. PDF yazma/birleştirme `pdf-lib` ile server-side
Node runtime'da yapılır.

## Annotation modeli

Yeni işaretlemeler `geometry_version=2` ve `anchor_kind=TEXT|REGION` kullanır.
Mantıksal annotation `source_annotations` içinde kalır; gerçek sayfa geometrisi
`source_annotation_fragments` içinde PDF user-space quad'larıyla saklanır. Çok satırlı
ve çok sayfalı seçimler tek annotation altında birden fazla fragment/quad olabilir.

V1 ekran overlay kayıtları `LEGACY_SCREEN` olarak kalır. Eski ekran koordinatları
sonradan güvenilir biçimde PDF koordinatına dönüştürülemediği için sessiz migration
yapılmaz.

## Provenance ve immutable kaynak

`ORIGINAL` asset overwrite edilmez. İşaretli çıktı ayrı `ANNOTATED_EXPORT` asset'idir
ve `derived_from_asset_id` ile orijinale bağlanır. Orijinal ve export için ayrı
SHA-256 değerleri tutulur. File Source oluştururken yayımlandığı orijinal URL ayrıca
saklanabilir.

## Deterministik export

Export route ownership doğrular, immutable PDF bytes'ını private Storage'dan okur,
v2 annotationları kaynak sayfalarına burn-in eder, CITEM ön sayfalarını gerçek PDF
olarak üretir, sayfaları tek dosyada birleştirir, export SHA-256/input SHA-256 üretir,
private Storage'a derived asset olarak yazar ve audit event oluşturur.

Authoritative PDF front matter uses an English-only presentation layer and ASCII
`BAYKUSH / CITEM` branding. The first pages use the same dark charcoal / amber visual
language as the analyst workspace and separate Investigation, Source, Collection Context,
Information Gaps, Collection Requirements and Source Provenance into structured cards.
The annotation summary uses source-page references, type badges, selected-text excerpts,
analyst notes and linked collection context. User-entered source titles, questions and
analyst notes are preserved verbatim; only the export chrome/labels are standardized.

Highlight/underline/region final PDF bytes'ının parçasıdır. Orijinal sayfalar rasterize
edilmez; metin/vector yapı korunur. Analist yorumları kaynak metni kapatmamak için ön
sayfadaki İşaretleme Dizini'nde tutulur; yorumu olan işaretlemelere kaynak sayfasında
numaralı callout eklenir.

## Güvenlik

- private Supabase Storage ve project ownership RLS korunur;
- PDF JavaScript/scripting çalıştırılmaz;
- viewer PDF.js worker'ını aynı uygulamadan servis eder;
- arbitrary HTML çalıştırılmaz;
- export Node runtime'dadır;
- original upload uygulama düzeyinde 50 MiB kalır, derived export bucket limiti 100 MiB'dır.

## Sınırlar

OCR, redaction, PDF form editing, dijital imza değiştirme, native viewer-specific
comment dictionaries ve Stage 3 IOC/TTP/entity extraction bu işin kapsamı dışındadır.
Text layer olmayan scan/görseller REGION annotation ile işaretlenebilir.
