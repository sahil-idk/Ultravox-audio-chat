# Voice Activity Indicator

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Features

- Audio visualization component that responds to microphone input or audio playback
- Real-time visualization of audio levels
- Support for multiple audio tracks
- Responsive design using shadcn/ui components

## Getting Started

First, place your audio files in the `/public/audio` directory:
- gardens.mp3
- kugelsicher.mp3
- spinning-head.mp3

Then, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

Visit [http://localhost:3000/audio](http://localhost:3000/audio) to see the audio visualizer.

## Dependencies

This project uses:
- Next.js for the React framework
- shadcn/ui for the component library
- motion for animations
- Web Audio API for audio processing

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
