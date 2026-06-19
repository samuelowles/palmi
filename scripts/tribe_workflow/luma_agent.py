import logging

class LumaAgent:
    def __init__(self):
        # In production, initialize Luma API client here
        self.api_key = "MOCK_LUMA_API_KEY"

    def generate_carousel(self, topic, feedback=""):
        """
        Calls the Luma API to generate an image/video carousel based on the topic.
        If feedback is provided, it adjusts the prompt accordingly.
        """
        logging.info(f"[LumaAgent] Generating carousel for topic: '{topic}'")
        if feedback and feedback != "Initial generation.":
            logging.info(f"[LumaAgent] Applying feedback: {feedback}")
            
        # Mocking the Luma API response
        mock_assets = {
            "topic": topic,
            "images": [
                f"https://luma.ai/mock/asset_1_{hash(topic)}.png",
                f"https://luma.ai/mock/asset_2_{hash(topic)}.png",
                f"https://luma.ai/mock/asset_3_{hash(topic)}.png"
            ],
            "overlay_text": [
                "Hook: " + topic,
                "Value: Here is the secret...",
                "CTA: Tag a friend who needs this!"
            ]
        }
        return mock_assets
