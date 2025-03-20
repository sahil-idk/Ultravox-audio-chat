/* eslint-disable @typescript-eslint/no-unused-vars */
import { NextRequest, NextResponse } from 'next/server';

// Configure environment variables or use them directly in production
const ULTRAVOX_API_KEY = process.env.ULTRAVOX_API_KEY || 'AuDi0STr.NvRkQ8PzXcB3L5TpYs2WmFjG7HdJqK9E4';


export async function GET(request: NextRequest) {
  try {
    const response = await fetch('https://api.ultravox.ai/api/voices', {
      method: 'GET',
      headers: {
        'X-API-Key': ULTRAVOX_API_KEY,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("error:");
      return NextResponse.json(
        { error: `Failed to fetch voices` },
        { status: response.status }
      );
    }
    
    const data = await response.json();
    
    
    if (data && data.results && Array.isArray(data.results)) {
      return NextResponse.json(data.results);
    } else {
      return NextResponse.json(data);
    }
  } catch (error) {
    console.error("Error fetching voices:");
    return NextResponse.json(
      { error: "Unknown error" },
      { status: 500 }
    );
  }
}

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
      console.error("API error:", response.status);
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
    console.error("Error creating call:");
    return NextResponse.json(
      { error: "Unknown error" },
      { status: 500 }
    );
  }
}