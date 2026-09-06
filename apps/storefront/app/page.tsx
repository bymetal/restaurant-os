export default function StorefrontHomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 text-center">
      <p className="text-sm text-slate-500">
        Bu uygulama restoranların QR menü sayfalarını sunar. Bir restoranın menüsünü görüntülemek için
        <code className="mx-1 rounded bg-slate-100 px-1.5 py-0.5">/r/[restoran-slug]</code>
        adresini ziyaret edin.
      </p>
    </main>
  );
}
