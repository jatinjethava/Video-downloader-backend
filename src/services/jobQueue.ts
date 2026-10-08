import { EventEmitter } from 'events';
import { MediaExtractionResult } from '../types';

export type JobStatus = 'waiting' | 'active' | 'completed' | 'failed';

export interface JobData {
  url: string;
  formatId: string;
  title?: string;
}

export interface Job {
  id: string;
  data: JobData;
  status: JobStatus;
  progress: number;
  result?: { downloadUrl: string; filePath: string; fileExt: string; title: string };
  error?: string;
  createdAt: Date;
  startedAt?: Date;
  finishedAt?: Date;
}

class JobQueue extends EventEmitter {
  private jobs: Map<string, Job> = new Map();
  private queue: string[] = [];
  private isProcessing = false;

  constructor() {
    super();
    this.on('newJob', this.processNext);
  }

  addJob(data: JobData): Job {
    const id = `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const job: Job = {
      id,
      data,
      status: 'waiting',
      progress: 0,
      createdAt: new Date(),
    };
    this.jobs.set(id, job);
    this.queue.push(id);
    this.emit('newJob');
    return job;
  }

  getJob(id: string): Job | undefined {
    return this.jobs.get(id);
  }

  updateProgress(id: string, progress: number) {
    const job = this.jobs.get(id);
    if (job) {
      job.progress = progress;
      this.emit(`progress:${id}`, progress);
    }
  }

  private async processNext() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;
    const jobId = this.queue.shift();
    if (!jobId) {
      this.isProcessing = false;
      return;
    }

    const job = this.jobs.get(jobId);
    if (!job) {
      this.isProcessing = false;
      this.processNext();
      return;
    }

    job.status = 'active';
    job.startedAt = new Date();
    this.emit(`active:${jobId}`);

    try {
      
      const result = await this.executeProcessor(job);
      job.status = 'completed';
      job.result = result;
      job.progress = 100;
      job.finishedAt = new Date();
    } catch (err: unknown) {
      job.status = 'failed';
      job.error = err instanceof Error ? err.message : String(err);
      job.finishedAt = new Date();
    } finally {
      this.isProcessing = false;
      this.processNext();
    }
  }

  private processorFn?: (job: Job, updateProgress: (p: number) => void) => Promise<{ downloadUrl: string; filePath: string; fileExt: string; title: string }>;

  registerProcessor(fn: (job: Job, updateProgress: (p: number) => void) => Promise<{ downloadUrl: string; filePath: string; fileExt: string; title: string }>) {
    this.processorFn = fn;
    
    this.processNext();
  }

  private async executeProcessor(job: Job): Promise<{ downloadUrl: string; filePath: string; fileExt: string; title: string }> {
    if (!this.processorFn) {
      throw new Error('No processor registered');
    }
    return this.processorFn(job, (p) => this.updateProgress(job.id, p));
  }
}

export const downloadQueue = new JobQueue();
