"use client";

import { useEffect, useState } from "react";
import { useCrawlerStore } from "@/store/useCrawlerStore";
import { getProjectStatus } from "@/services/api";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertCircle, Loader2, ArrowLeft } from "lucide-react";

export default function CrawlerProgress() {
    const { projectId, status, isPolling, setStatus, stopPolling, setView, reset } = useCrawlerStore();
    const [progressValue, setProgressValue] = useState(0);

    useEffect(() => {
        let interval: NodeJS.Timeout;

        if (isPolling && projectId) {
            interval = setInterval(async () => {
                try {
                    const latestStatus = await getProjectStatus(projectId);
                    setStatus(latestStatus);
                    
                    const limit = latestStatus.max_pages || 50;
                    const calculatedProgress = Math.min(100, Math.round((latestStatus.pages_crawled / limit) * 100));
                    setProgressValue(calculatedProgress);

                    if (latestStatus.status === "completed" || latestStatus.status === "failed") {
                        stopPolling();
                        if (latestStatus.status === "completed") {
                            setProgressValue(100);
                        }
                    }
                } catch (error) {
                    console.error("Failed to poll status", error);
                }
            }, 2000);
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isPolling, projectId, setStatus, stopPolling]);

    if (!status) return null;


    const isDone = status.status === "completed";
    const isFailed = status.status === "failed";
    const isCrawling = status.status === "crawling" || status.status === "pending";

    return (
        <Card className="w-full max-w-xl mx-auto shadow-xl bg-slate-900 border-slate-800 text-white overflow-hidden">
            <CardHeader className="space-y-1 text-center bg-slate-800/50 pb-8 relative">
                {isDone && <div className="absolute inset-0 bg-green-500/10 z-0" />}
                {isFailed && <div className="absolute inset-0 bg-red-500/10 z-0" />}
                <div className="relative z-10 flex flex-col items-center gap-4">
                    <div className="p-4 rounded-full bg-slate-800 ring-4 ring-slate-900 shadow-xl">
                        {isCrawling && <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />}
                        {isDone && <CheckCircle2 className="w-8 h-8 text-green-400" />}
                        {isFailed && <AlertCircle className="w-8 h-8 text-red-400" />}
                    </div>
                    <div>
                        <CardTitle className="text-2xl font-bold tracking-tight">
                            {isCrawling && "Crawling in Progress..."}
                            {isDone && "Crawling Completed!"}
                            {isFailed && "Crawling Failed"}
                        </CardTitle>
                        <CardDescription className="text-slate-400 mt-2">
                            {isCrawling && `Discovered ${status.pages_crawled} pages so far.`}
                            {isDone && `Successfully crawled ${status.pages_crawled} pages.`}
                            {isFailed && (status.error_message || "An unknown error occurred.")}
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="pt-8 pb-8 px-8 space-y-6">
                <div className="space-y-2">
                    <div className="flex justify-between text-sm font-medium text-slate-300">
                        <span>Progress</span>
                        <span>{progressValue}%</span>
                    </div>
                    <Progress value={progressValue} className="h-2 bg-slate-800">
                        <div 
                            className={`h-full transition-all duration-500 ease-in-out ${isFailed ? 'bg-red-500' : isDone ? 'bg-green-500' : 'bg-blue-500'}`} 
                            style={{ width: `${progressValue}%` }} 
                        />
                    </Progress>
                </div>
                
                <div className="grid grid-cols-2 gap-4 pt-4">
                    <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700/50 flex flex-col items-center justify-center">
                        <span className="text-3xl font-bold text-slate-100">{status.pages_crawled}</span>
                        <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold mt-1">Pages Crawled</span>
                    </div>
                    <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700/50 flex flex-col items-center justify-center">
                        <span className={`text-3xl font-bold ${status.failed_pages > 0 ? 'text-red-400' : 'text-slate-100'}`}>
                            {status.failed_pages}
                        </span>
                        <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold mt-1">Failed Pages</span>
                    </div>
                </div>
            </CardContent>
            {(isDone || isFailed) && (
                <CardFooter className="bg-slate-800/50 border-t border-slate-800 flex gap-3">
                    <Button 
                        onClick={reset} 
                        variant="ghost" 
                        className="flex-1 text-slate-300 hover:text-white hover:bg-slate-700"
                    >
                        <ArrowLeft className="w-4 h-4 mr-2" />
                        Start New Crawl
                    </Button>
                    <Button 
                        onClick={() => setView('dashboard')} 
                        className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-lg shadow-indigo-900/20"
                    >
                        View Dashboard
                    </Button>
                </CardFooter>
            )}
        </Card>

    );
}
