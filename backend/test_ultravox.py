import os
import requests
import json
from dotenv import load_dotenv

# Load the same .env file your backend is using
load_dotenv()

# Get the API key
api_key = os.getenv('ULTRAVOX_API_KEY')
if not api_key:
    print("ERROR: No API key found in environment variables!")
    exit(1)

print(f"Using API key: {api_key[:4]}...{api_key[-4:] if len(api_key) > 8 else '***'}")

# Set up the request
url = "https://api.ultravox.ai/api/calls"
headers = {
    "X-API-Key": api_key,
    "Content-Type": "application/json",
    "Accept": "application/json"
}

body = {
    "systemPrompt": "Test prompt",
    "temperature": 0.8,
    "medium": {
        "serverWebSocket": {
            "inputSampleRate": 48000,
            "outputSampleRate": 48000,
            "clientBufferSizeMs": 30000,
        }
    }
}

print(f"Making request to {url}")
print(f"Request headers: {headers}")
print(f"Request body: {json.dumps(body, indent=2)}")

try:
    response = requests.post(url, headers=headers, json=body)
    print(f"\nResponse status code: {response.status_code}")
    print(f"Response headers: {dict(response.headers)}")
    
    try:
        response_json = response.json()
        print(f"Response data: {json.dumps(response_json, indent=2)}")
    except:
        print(f"Response text: {response.text}")
    
    if response.status_code == 200:
        print("\nSUCCESS: API call worked correctly!")
    else:
        print(f"\nERROR: API returned non-200 status code: {response.status_code}")
except Exception as e:
    print(f"\nERROR: Exception during API call: {str(e)}")