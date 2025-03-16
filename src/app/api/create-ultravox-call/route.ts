import { NextRequest, NextResponse } from 'next/server';

// Configure environment variables or use them directly in production
const ULTRAVOX_API_KEY = process.env.ULTRAVOX_API_KEY || 'dSn7oxDz.oUsfzT4pnjJbCl4keqq6DWlAlT23Ip0t';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Default parameters if not provided
    const systemPrompt = body.systemPrompt || "You are a helpful assistant...";
    const voice = body.voice || "Mark";
    const temperature = body.temperature || 0.7;
    
    // Create call with Ultravox API
    const response = await fetch('https://api.ultravox.ai/api/calls', {
      method: 'POST',
      headers: {
        'X-API-Key': ULTRAVOX_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        systemPrompt: systemPrompt,
        model: "fixie-ai/ultravox-70B",
        voice: voice,
        temperature: temperature,
        // Ensure real-time response with interactive capabilities
        inactivityMessages: [
          {
            "duration": "60s",
            "message": "Are you still there?"
          },
          {
            "duration": "30s",
            "message": "I'll end the call if I don't hear from you soon.",
            "endBehavior": "END_BEHAVIOR_HANG_UP_SOFT"
          }
        ]
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Ultravox API error:", response.status, errorText);
      return NextResponse.json(
        { error: `Failed to create call: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }
    
    const data = await response.json();
    
    return NextResponse.json({
      callId: data.callId,
      joinUrl: data.joinUrl
    });
  } catch (error) {
    console.error("Error creating Ultravox call:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}