const steps = [
  {
    number: "01",
    title: "Import Your CV",
    description: "Upload your existing resume. Our AI extracting engine parses and normalizes your data dynamically.",
  },
  {
    number: "02",
    title: "Refine Your Profile",
    description: "Manage your tabs, add context, reorder items, and choose from multiple AI-generated summaries.",
  },
  {
    number: "03",
    title: "Generate Tailored Resumes",
    description: "Match your profile details semantically with target job applications, exporting customized CVs.",
  },
];

export default function HowItWorks() {
  return (
    <section className="bg-slate-950 py-20 lg:py-28 relative border-t border-slate-900">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-base font-semibold text-blue-400 tracking-wide uppercase">Workflow</h2>
          <p className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Three simple steps to conversion
          </p>
        </div>

        <div className="mx-auto mt-16 max-w-5xl sm:mt-20 lg:mt-24">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-3">
            {steps.map((step, idx) => (
              <div key={idx} className="relative flex flex-col items-center text-center group">
                {/* Visual Step Connection Line */}
                {idx < 2 && (
                  <div className="hidden lg:block absolute top-12 left-[calc(50%+4rem)] right-[calc(-50%+4rem)] h-0.5 bg-gradient-to-r from-blue-500/20 to-indigo-500/0" />
                )}

                {/* Step Badge */}
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-900 border border-slate-800 text-2xl font-bold text-blue-400 shadow-md transition-all duration-300 group-hover:border-blue-500 group-hover:scale-110 group-hover:shadow-blue-500/10">
                  {step.number}
                </div>

                <h3 className="mt-8 text-xl font-bold text-white">{step.title}</h3>
                <p className="mt-3 text-sm text-slate-400 leading-relaxed max-w-xs">{step.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
