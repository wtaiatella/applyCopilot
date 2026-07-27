import { Upload, Save, ShieldAlert, Cpu } from "lucide-react";

const features = [
  {
    icon: Upload,
    title: "Instant Resume Parser",
    description: "Upload PDF or DOCX. Watch our Server-Sent Events stream progress as it populates your profile in real-time.",
    color: "from-blue-500/10 to-indigo-500/10 border-blue-500/20 text-blue-400",
  },
  {
    icon: Save,
    title: "Context-Backed Auto-Save",
    description: "Edit your highlights, projects, and skills without fear. Unsaved changes are debounced and saved in the background.",
    color: "from-indigo-500/10 to-purple-500/10 border-indigo-500/20 text-indigo-400",
  },
  {
    icon: Cpu,
    title: "Dynamic AI Client Routing",
    description: "Route your AI tasks dynamically between local models (Ollama) and high-performance cloud providers (Gemini, Claude).",
    color: "from-purple-500/10 to-pink-500/10 border-purple-500/20 text-purple-400",
  },
  {
    icon: ShieldAlert,
    title: "Privacy by Default",
    description: "Your data belongs to you. In-memory processing and secure local database instances ensure absolute confidentiality.",
    color: "from-pink-500/10 to-red-500/10 border-pink-500/20 text-pink-400",
  },
];

export default function Features() {
  return (
    <section className="bg-black py-20 lg:py-28 relative">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-indigo-500/5 blur-[150px] pointer-events-none" />

      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-base font-semibold text-blue-400 tracking-wide uppercase">Core Capabilities</h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Everything you need for a competitive edge
          </p>
        </div>

        <div className="mx-auto mt-16 max-w-5xl sm:mt-20 lg:mt-24">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
            {features.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <div
                  key={idx}
                  className={`relative overflow-hidden rounded-2xl border bg-gradient-to-br p-8 transition-all duration-300 hover:-translate-y-1 hover:border-slate-500/30 ${feature.color}`}
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 border border-slate-700/50 mb-6">
                    <Icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-3">{feature.title}</h3>
                  <p className="text-slate-400 text-sm leading-relaxed">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
