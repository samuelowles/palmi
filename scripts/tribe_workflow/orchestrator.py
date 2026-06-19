import os
import time
import logging
from luma_agent import LumaAgent
from tribe_client import TribeClient
from deepseek_critic import DeepSeekCritic

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

class TribeWorkflowOrchestrator:
    def __init__(self):
        self.luma = LumaAgent()
        self.tribe = TribeClient()
        self.critic = DeepSeekCritic()
        self.target_posts_per_day = 30
        
    def generate_and_evaluate(self, topic):
        """
        Generates a carousel using Luma, evaluates it with TRIBE v2,
        and gets a pass/fail from DeepSeek. Retries if it fails.
        """
        max_retries = 3
        feedback = "Initial generation."
        
        for attempt in range(max_retries):
            logging.info(f"Attempt {attempt + 1}/{max_retries} for topic: {topic}")
            
            # 1. Luma creates carousel
            carousel_assets = self.luma.generate_carousel(topic, feedback)
            if not carousel_assets:
                logging.error("Failed to generate carousel assets.")
                continue
                
            # 2. TRIBE v2 simulates audience neural response
            fmri_scores = self.tribe.predict_neural_response(carousel_assets)
            
            # 3. DeepSeek interprets fMRI scores and decides
            evaluation = self.critic.evaluate_fmri(fmri_scores)
            
            if evaluation['approved']:
                logging.info(f"Carousel approved! Hook strength: {fmri_scores.get('nucleus_accumbens', 0)}")
                return carousel_assets
            else:
                logging.info(f"Carousel rejected. Feedback: {evaluation['feedback']}")
                feedback = evaluation['feedback']
                
        logging.warning(f"Failed to generate approved carousel for topic {topic} after {max_retries} attempts.")
        return None

    def post_to_tiktok(self, carousel_assets):
        """
        Mock function to post the approved carousel to TikTok.
        In production, this would use Ayrshare or a direct TikTok Graph API call.
        """
        logging.info(f"Successfully posted carousel to TikTok: {carousel_assets}")
        return True

    def run_daily_batch(self, topics):
        """
        Run the workflow to generate and post the target number of carousels.
        """
        approved_count = 0
        for topic in topics:
            if approved_count >= self.target_posts_per_day:
                break
                
            approved_assets = self.generate_and_evaluate(topic)
            
            if approved_assets:
                self.post_to_tiktok(approved_assets)
                approved_count += 1
                
        logging.info(f"Daily batch complete. Posted {approved_count}/{self.target_posts_per_day} carousels.")

if __name__ == "__main__":
    # Example topics for Gen-Z palmistry/astrology hooks
    daily_topics = [
        "3 signs your lifeline means you'll be rich",
        "What a broken heart line actually means",
        "Stop ignoring this mark on your index finger",
        "Palm reading secrets nobody tells you",
        "Why your mount of Venus matters for your love life"
    ] * 6 # Repeat to hit 30
    
    orchestrator = TribeWorkflowOrchestrator()
    orchestrator.run_daily_batch(daily_topics)
