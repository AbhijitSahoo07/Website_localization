"use client";

import { useCrawlerStore } from "@/store/useCrawlerStore";
import CrawlerForm from "@/components/CrawlerForm";
import CrawlerProgress from "@/components/CrawlerProgress";
import Dashboard from "@/components/Dashboard";
import TranslationEditor from "@/components/TranslationEditor";
import PublishPanel from "@/components/PublishPanel";

export default function Home() {
    const { view, projectId } = useCrawlerStore();

    return (
        <main className="min-h-screen bg-slate-950 flex items-center justify-center p-4 sm:p-8">
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:14px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none" />
            
            <div className="z-10 w-full animate-in fade-in zoom-in duration-500">
                {view === 'form' && <CrawlerForm />}
                {view === 'progress' && <CrawlerProgress />}
                {view === 'dashboard' && projectId && <Dashboard projectId={projectId} />}
                {view === 'editor' && <TranslationEditor />}
                {view === 'publish' && projectId && <PublishPanel />}
            </div>
        </main>
    );
}


