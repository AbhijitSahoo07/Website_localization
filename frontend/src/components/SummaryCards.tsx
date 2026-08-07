import { ProjectSummary } from "@/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Type, Clock, CheckCircle, XCircle } from "lucide-react";

interface SummaryCardsProps {
    summary: ProjectSummary;
}

export default function SummaryCards({ summary }: SummaryCardsProps) {
    const cards = [
        {
            title: "Total Pages",
            value: summary.total_pages,
            description: "Total crawled URLs",
            icon: FileText,
            color: "text-blue-400",
        },
        {
            title: "Total Words",
            value: summary.total_words.toLocaleString(),
            description: "Extracted source words",
            icon: Type,
            color: "text-indigo-400",
        },
        {
            title: "Translation Effort",
            value: `${summary.estimated_effort_hours}h`,
            description: "Estimated hours required",
            icon: Clock,
            color: "text-amber-400",
        },
        {
            title: "Successful Crawls",
            value: summary.successful_crawls,
            description: "Pages retrieved successfully",
            icon: CheckCircle,
            color: "text-green-400",
        },
        {
            title: "Failed Crawls",
            value: summary.failed_crawls,
            description: "Pages with errors",
            icon: XCircle,
            color: "text-red-400",
        },
    ];

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {cards.map((card, idx) => {
                const Icon = card.icon;
                return (
                    <Card key={idx} className="bg-slate-900 border-slate-800 text-white">
                        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                            <CardTitle className="text-sm font-medium text-slate-400">{card.title}</CardTitle>
                            <Icon className={`h-4 w-4 ${card.color}`} />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{card.value}</div>
                            <p className="text-xs text-slate-500 mt-1">{card.description}</p>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}
