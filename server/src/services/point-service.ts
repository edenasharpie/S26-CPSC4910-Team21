// Commenting out file due to database functionality

/* import { calculatePointsFromDollars } from "../utils/points";

export async function addPurchaseToDriver(driverId: string, purchaseAmount: number, sponsorId: string) {
    const sponsor = await db.sponsors.findUnique({ where: { id: sponsorId } });
    const currentRatio = sponsor.pointValueRatio;

    const pointsToEarn = calculatePointsFromDollars(purchaseAmount, currentRatio);

    await db.drivers.update({
        where: { id: driverId },
        data: { points: { increment: pointsToEarn } }
    });

    return pointsToEarn;
}

*/