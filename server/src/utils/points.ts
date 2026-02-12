// Function to calculate how much an item costs in points
export function calculatePointsFromDollars(dollars: number, ratio: number): number {
    if (dollars < 0 || ratio <= 0) return 0;

    const totalPoints = dollars * ratio;


    return Math.floor(totalPoints);
}

// Function to calculate how much an item costs in dollars
export function calculateDollarsFromPoints(points: number, ratio: number): string {
    if (points <= 0 || ratio <0) return "0.00";

    const dollarValue = points / ratio;

    return dollarValue.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
    });
}