import logging

class DeepSeekCritic:
    def __init__(self):
        # In production, initialize DeepSeek API client
        self.api_key = "MOCK_DEEPSEEK_API_KEY"
        
        # Neuro-heuristic Baseline parameters (based on empirical evidence for Gen-Z TikTok)
        # We want high reward, high emotion, low cognitive friction.
        self.thresholds = {
            "min_nucleus_accumbens": 0.75, # High reward expectation needed for hook
            "min_amygdala": 0.60,          # Needs some emotional valence
            "max_prefrontal_cortex": 0.55  # If cognitive load is too high, they swipe
        }

    def evaluate_fmri(self, fmri_scores):
        """
        Evaluates the fMRI scores against the baseline.
        Uses DeepSeek to generate specific feedback if the post fails the heuristics.
        """
        logging.info("[DeepSeekCritic] Evaluating fMRI scores against neuro-heuristic baseline...")
        
        failed_heuristics = []
        
        if fmri_scores["nucleus_accumbens"] < self.thresholds["min_nucleus_accumbens"]:
            failed_heuristics.append("Nucleus Accumbens (Reward) is too low.")
            
        if fmri_scores["amygdala"] < self.thresholds["min_amygdala"]:
            failed_heuristics.append("Amygdala (Emotion) is too low.")
            
        if fmri_scores["prefrontal_cortex"] > self.thresholds["max_prefrontal_cortex"]:
            failed_heuristics.append("Prefrontal Cortex (Cognitive Load) is too high.")
            
        if not failed_heuristics:
            # Passed all heuristics
            return {
                "approved": True,
                "feedback": ""
            }
            
        # If it failed, we use DeepSeek to generate actionable creative feedback for Luma
        # Mocking the DeepSeek LLM prompt and response
        prompt = f"The generated carousel failed the following neuro-heuristics: {', '.join(failed_heuristics)}. Generate brief, actionable feedback for an AI image generator to fix this."
        logging.info(f"[DeepSeekCritic] Generating feedback via DeepSeek API...")
        
        # Mock DeepSeek response logic
        feedback = "Increase visual contrast on the first slide to boost reward expectation. Simplify text overlays to reduce cognitive load and use more emotive human faces."
        
        return {
            "approved": False,
            "feedback": feedback
        }
