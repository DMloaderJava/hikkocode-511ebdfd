import { motion } from "framer-motion";
import { Sparkles, Code, Eye, MessageSquare, Zap, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Landing() {
  const navigate = useNavigate();

  const features = [
    { icon: MessageSquare, title: "Chat-Driven Dev", desc: "Describe your app in plain English. We'll pretend to understand." },
    { icon: Eye, title: "Live Preview", desc: "See your app render in real-time. Watch the bugs appear instantly!" },
    { icon: Code, title: "Code Generation", desc: "AI writes your code so you can take credit for it." },
    { icon: Zap, title: "Instant Deploy", desc: "Deploy at the speed of a well-caffeinated hamster." },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Sparkles className="w-6 h-6 text-primary" />
          <span className="font-bold text-xl gradient-text">Laughable</span>
        </div>
        <button
          onClick={() => navigate("/builder")}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Start Building
        </button>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center text-center px-4 pt-24 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm mb-8 border border-primary/20">
            <Sparkles className="w-4 h-4" />
            Parody AI App Builder — For Educational Purposes
          </div>

          <h1 className="text-5xl md:text-7xl font-bold mb-6 leading-tight">
            Build apps with
            <br />
            <span className="gradient-text">questionable AI</span>
          </h1>

          <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-10">
            The AI app builder that generates code just like the real ones — except we're honest about the chaos. 
            Describe your dream app and watch it materialize (mostly).
          </p>

          <div className="flex items-center gap-4 justify-center">
            <button
              onClick={() => navigate("/builder")}
              className="px-8 py-3 rounded-xl gradient-primary text-primary-foreground font-semibold text-lg hover:opacity-90 transition-all flex items-center gap-2"
            >
              Start Building <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </motion.div>
      </section>

      {/* Terminal mockup */}
      <section className="max-w-3xl mx-auto px-4 mb-24">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-xl border border-border bg-card overflow-hidden"
        >
          <div className="flex items-center gap-2 px-4 py-3 bg-secondary/50 border-b border-border">
            <div className="w-3 h-3 rounded-full bg-destructive/60" />
            <div className="w-3 h-3 rounded-full bg-accent/40" />
            <div className="w-3 h-3 rounded-full bg-primary/40" />
            <span className="ml-2 text-xs text-muted-foreground">laughable-terminal</span>
          </div>
          <div className="p-6 font-mono text-sm space-y-2">
            <p><span className="text-primary">$</span> <span className="text-muted-foreground">laughable create my-app</span></p>
            <p className="text-accent">🎨 Convincing CSS to align divs...</p>
            <p className="text-accent">🧠 Teaching AI what flexbox means...</p>
            <p className="text-accent">🐛 Pre-debugging your bugs...</p>
            <p className="text-primary">✅ Project generated! (4 files, 0 regrets)</p>
            <p><span className="text-primary">$</span> <span className="text-muted-foreground animate-pulse-neon">▊</span></p>
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 pb-24">
        <h2 className="text-3xl font-bold text-center mb-12">
          Everything you need <span className="gradient-text">(probably)</span>
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 * i }}
              className="rounded-xl border border-border bg-card p-6 hover:border-primary/30 transition-colors"
            >
              <f.icon className="w-8 h-8 text-primary mb-4" />
              <h3 className="font-semibold text-lg mb-2 text-foreground">{f.title}</h3>
              <p className="text-sm text-muted-foreground">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 text-center text-sm text-muted-foreground">
        <p>🤖 Laughable AI — A parody for educational purposes. Not affiliated with any real AI tool.</p>
      </footer>
    </div>
  );
}
