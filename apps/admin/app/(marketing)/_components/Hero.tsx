import { Check } from "lucide-react";
import { Button, BarLineChart, DonutChart, MetricCard } from "@restaurant-os/ui";

const revenueSeries = [
  { date: "1 Mar", orders: 38 }, { date: "5 Mar", orders: 44 }, { date: "9 Mar", orders: 52 },
  { date: "13 Mar", orders: 61 }, { date: "17 Mar", orders: 58 }, { date: "21 Mar", orders: 67 },
  { date: "25 Mar", orders: 73 }, { date: "31 Mar", orders: 81 }
];

const channelSplit = [
  { name: "QR Menü", value: 62, color: "#dc2626" },
  { name: "WhatsApp", value: 24, color: "#fca5a5" },
  { name: "Web Link", value: 10, color: "#fecaca" },
  { name: "Diğer", value: 4, color: "#e2e8f0" }
];

const checklist = ["Hızlı kurulum", "Komisyon yok", "Sizin markanız, sizin müşteriniz"];

export function Hero() {
  return (
    <section className="mx-auto grid max-w-6xl gap-12 px-6 py-16 md:grid-cols-2 md:items-center">
      <div>
        <p className="text-sm font-bold uppercase tracking-wide text-brand-600">
          Daha fazla misafir. Daha fazla tekrar ziyaret.
        </p>
        <h1 className="mt-3 text-4xl font-extrabold leading-tight text-slate-900 md:text-5xl">
          Restoranınızın müşterisini başka platformlara bırakmayın.
        </h1>
        <p className="mt-4 text-lg text-slate-600">
          QR menü, WhatsApp ile müşteri kazanımı, doğrudan sipariş, sadakat programı ve gelişmiş analitik ile
          misafirlerinizle doğrudan siz iletişim kurun. Komisyon yok, veriler sizde, müşteri ilişkisi sizin
          kontrolünüzde.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button>Demo İste →</Button>
          <Button variant="outline">Sistemi Gör</Button>
        </div>
        <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
          {checklist.map((item) => (
            <li key={item} className="flex items-center gap-1.5">
              <Check size={16} className="text-emerald-600" />
              {item}
            </li>
          ))}
        </ul>
      </div>
      <div className="overflow-hidden rounded-xl2 border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center gap-1.5 border-b border-slate-100 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
          <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
        </div>
        <div className="p-5">
          <p className="text-sm font-semibold text-slate-900">Genel Bakış</p>
          <p className="text-xs text-slate-500">Restoranınızın performans özeti</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <MetricCard label="Toplam Sipariş" value="1.482" trendPct={28} />
            <MetricCard label="Toplam Ciro" value="₺284.320" trendPct={32} />
            <MetricCard label="Aktif Misafir" value="892" trendPct={18} />
            <MetricCard label="Tekrar Sipariş Oranı" value="%41" trendPct={12} />
          </div>
          <div className="mt-4 grid grid-cols-5 gap-3">
            <div className="col-span-3">
              <BarLineChart data={revenueSeries} xKey="date" barKey="orders" height={140} />
            </div>
            <div className="col-span-2">
              <DonutChart data={channelSplit} height={140} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
