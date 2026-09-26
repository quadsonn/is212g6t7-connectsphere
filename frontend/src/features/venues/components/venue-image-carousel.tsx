import { useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

export function VenueImageCarousel({
    images,
    onRemove,
}: {
    images: string[];
    onRemove?: (imageUrl: string) => void;
}) {
    const [index, setIndex] = useState(0);

    if (images.length === 0) {
        return (
            <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-ink-300 text-sm text-ink-400">
                No photos yet
            </div>
        );
    }

    const current = images[Math.min(index, images.length - 1)];
    const goPrev = () => setIndex((i) => (i - 1 + images.length) % images.length);
    const goNext = () => setIndex((i) => (i + 1) % images.length);

    return (
        <div className="space-y-2">
            <div className="relative overflow-hidden rounded-lg bg-ink-100">
                <img
                    src={current}
                    alt={`Venue photo ${index + 1} of ${images.length}`}
                    className="h-56 w-full object-cover"
                />

                {images.length > 1 ? (
                    <>
                        <button
                            type="button"
                            onClick={goPrev}
                            aria-label="Previous photo"
                            className="absolute left-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
                        >
                            <ChevronLeft className="size-4" />
                        </button>
                        <button
                            type="button"
                            onClick={goNext}
                            aria-label="Next photo"
                            className="absolute right-2 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white hover:bg-black/70"
                        >
                            <ChevronRight className="size-4" />
                        </button>
                    </>
                ) : null}

                {onRemove ? (
                    <button
                        type="button"
                        onClick={() => onRemove(current)}
                        aria-label="Remove this photo"
                        className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full bg-black/50 text-white hover:bg-red-600"
                    >
                        <X className="size-4" />
                    </button>
                ) : null}
            </div>

            {images.length > 1 ? (
                <div className="flex justify-center gap-1.5">
                    {images.map((img, i) => (
                        <button
                            key={img}
                            type="button"
                            onClick={() => setIndex(i)}
                            aria-label={`Go to photo ${i + 1}`}
                            className={`size-2 rounded-full ${i === index ? 'bg-brand-600' : 'bg-ink-300'
                                }`}
                        />
                    ))}
                </div>
            ) : null}
        </div>
    );
}