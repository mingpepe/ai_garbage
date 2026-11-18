namespace JpegCore.Math;

public readonly record struct YCbCrPixel(byte Y, byte Cb, byte Cr);

public static class ColorSpace
{
    public static YCbCrPixel RgbToYCbCr(byte r, byte g, byte b, bool fixedPoint = false)
    {
        if (fixedPoint)
        {
            // Matches Verilog rgb_to_ycbcr.v Q8 integer arithmetic
            int y = (77 * r + 150 * g + 29 * b + 128) >> 8;
            int cb = ((-43 * r - 85 * g + 128 * b + 128) >> 8) + 128;
            int cr = ((128 * r - 107 * g - 21 * b + 128) >> 8) + 128;
            return new YCbCrPixel(
                (byte)System.Math.Clamp(y, 0, 255),
                (byte)System.Math.Clamp(cb, 0, 255),
                (byte)System.Math.Clamp(cr, 0, 255));
        }

        double yd = 0.299 * r + 0.587 * g + 0.114 * b;
        double cbd = -0.168736 * r - 0.331264 * g + 0.5 * b + 128.0;
        double crd = 0.5 * r - 0.418688 * g - 0.081312 * b + 128.0;

        return new YCbCrPixel(
            (byte)System.Math.Clamp((int)System.Math.Round(yd), 0, 255),
            (byte)System.Math.Clamp((int)System.Math.Round(cbd), 0, 255),
            (byte)System.Math.Clamp((int)System.Math.Round(crd), 0, 255));
    }

    public static (byte R, byte G, byte B) YCbCrToRgb(byte y, byte cb, byte cr, bool fixedPoint = false)
    {
        int cbOff = cb - 128;
        int crOff = cr - 128;

        if (fixedPoint)
        {
            // Matches Verilog ycbcr_to_rgb.v Q8 integer arithmetic
            int r = ((y << 8) + 359 * crOff + 128) >> 8;
            int g = ((y << 8) - 88 * cbOff - 183 * crOff + 128) >> 8;
            int b = ((y << 8) + 454 * cbOff + 128) >> 8;
            return (
                (byte)System.Math.Clamp(r, 0, 255),
                (byte)System.Math.Clamp(g, 0, 255),
                (byte)System.Math.Clamp(b, 0, 255));
        }

        double rd = y + 1.402 * crOff;
        double gd = y - 0.344136 * cbOff - 0.714136 * crOff;
        double bd = y + 1.772 * cbOff;

        return (
            (byte)System.Math.Clamp((int)System.Math.Round(rd), 0, 255),
            (byte)System.Math.Clamp((int)System.Math.Round(gd), 0, 255),
            (byte)System.Math.Clamp((int)System.Math.Round(bd), 0, 255));
    }
}
