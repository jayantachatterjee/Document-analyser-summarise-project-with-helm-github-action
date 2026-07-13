import os
import time
import json
import redis
import psycopg2

REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379')
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://user:pass@localhost:5432/db')

def process_task(task_data):
    job_id = task_data['jobId']
    text = task_data['text']
    
    print(f"Processing job {job_id}...", flush=True)
    
    # Simulating AI processing delay and generation
    time.sleep(5) 
    ai_summary = f"[AI Summary]: This document contains {len(text.split())} words. Core context: {text[:50]}..."

    # Update PostgreSQL with result
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    cur.execute(
        "UPDATE summaries SET summary = %s, status = %s WHERE id = %s",
        (ai_summary, 'COMPLETED', job_id)
    )
    conn.commit()
    cur.close()
    conn.close()
    print(f"Job {job_id} successfully completed.", flush=True)

def main():
    print("AI Worker successfully started. Listening for tasks...", flush=True)
    r = redis.Redis.from_url(REDIS_URL)
    
    while True:
        # Blocking pop from queue
        backlog, item = r.brpop('ai_tasks')
        if item:
            task_data = json.loads(item.decode('utf-8'))
            try:
                process_task(task_data)
            except Exception as e:
                print(f"Error processing job: {e}", flush=True)

if __name__ == '__main__':
    main()