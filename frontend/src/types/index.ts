export interface Project {
    id: number;
    name: string | null;
    target_url: string;
    target_language: string;
    status: 'pending' | 'crawling' | 'completed' | 'failed';
    error_message: string | null;
    max_pages?: number;
    max_depth?: number;
    created_at: string;
    updated_at: string;
}

export interface ProjectStatus {
    status: 'pending' | 'crawling' | 'completed' | 'failed';
    error_message: string | null;
    pages_crawled: number;
    failed_pages: number;
    max_pages?: number;
    max_depth?: number;
}

export interface Page {
    id: number;
    project_id: number;
    url: string;
    title: string | null;
    http_status: number | null;
    word_count: number;
    detected_language: string | null;
    error_message: string | null;
    is_selected: boolean;
    translation_status: string;
    page_type: string;
    crawl_issues: string[];
    crawl_timestamp: string;
}

export interface ProjectSummary {
    total_pages: number;
    total_words: number;
    estimated_effort_hours: number;
    successful_crawls: number;
    failed_crawls: number;
}

export interface TranslationSegment {
    id: number;
    page_id: number;
    source_text: string;
    source_language: string;
    translated_text: string | null;
    target_language: string;
    selector: string | null;
    status: 'Pending' | 'Machine Translated' | 'Edited' | 'Approved';
    created_at: string;
    updated_at: string;
}

export interface PublishVersion {
    id: number;
    project_id: number;
    version: number;
    status: string;
    total_segments: number;
    published_at: string;
    created_at: string;
}

export interface PublishStatus {
    is_published: boolean;
    current_version: number | null;
    published_at: string | null;
    total_approved: number;
    total_segments: number;
    project_id: number;
}
