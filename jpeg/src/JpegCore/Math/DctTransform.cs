namespace JpegCore.Math;

public static class DctTransform
{
    // Orthonormal 1D DCT-II basis matrix T[u, x] = (1/2) * C(u) * cos((2x + 1) * u * pi / 16)
    private static readonly double[,] BasisDouble = BuildBasisDouble();
    private static readonly int[,] BasisQ14 = BuildBasisQ14();

    private static double[,] BuildBasisDouble()
    {
        var t = new double[8, 8];
        double invSqrt2 = 1.0 / System.Math.Sqrt(2.0);
        for (int u = 0; u < 8; u++)
        {
            double cu = u == 0 ? invSqrt2 : 1.0;
            for (int x = 0; x < 8; x++)
            {
                t[u, x] = 0.5 * cu * System.Math.Cos((2 * x + 1) * u * System.Math.PI / 16.0);
            }
        }
        return t;
    }

    private static int[,] BuildBasisQ14()
    {
        var q = new int[8, 8];
        for (int u = 0; u < 8; u++)
        {
            for (int x = 0; x < 8; x++)
            {
                q[u, x] = (int)System.Math.Round(BasisDouble[u, x] * 16384.0);
            }
        }
        return q;
    }

    public static void Forward2D(
        int[] shiftedBlock64,
        out double[] rowStage64,
        out double[] dctFloat64,
        out int[] dctRounded64,
        bool fixedPoint = false)
    {
        rowStage64 = new double[64];
        dctFloat64 = new double[64];
        dctRounded64 = new int[64];

        if (fixedPoint)
        {
            var rowQ3 = new int[64];
            for (int r = 0; r < 8; r++)
            {
                for (int u = 0; u < 8; u++)
                {
                    int acc = 0;
                    for (int x = 0; x < 8; x++)
                    {
                        acc += shiftedBlock64[r * 8 + x] * BasisQ14[u, x];
                    }
                    int val = (acc + 1024) >> 11;
                    rowQ3[r * 8 + u] = val;
                    rowStage64[r * 8 + u] = val / 8.0;
                }
            }

            for (int u = 0; u < 8; u++)
            {
                for (int v = 0; v < 8; v++)
                {
                    int acc = 0;
                    for (int y = 0; y < 8; y++)
                    {
                        acc += rowQ3[y * 8 + u] * BasisQ14[v, y];
                    }
                    int val = (acc + 65536) >> 17;
                    dctFloat64[v * 8 + u] = val;
                    dctRounded64[v * 8 + u] = val;
                }
            }
            return;
        }

        // Row-wise 1D FDCT: F_row[r, u] = sum_x f[r, x] * T[u, x]
        for (int r = 0; r < 8; r++)
        {
            for (int u = 0; u < 8; u++)
            {
                double sum = 0.0;
                for (int x = 0; x < 8; x++)
                {
                    sum += shiftedBlock64[r * 8 + x] * BasisDouble[u, x];
                }
                rowStage64[r * 8 + u] = sum;
            }
        }

        // Column-wise 1D FDCT: F[v, u] = sum_y F_row[y, u] * T[v, y]
        for (int v = 0; v < 8; v++)
        {
            for (int u = 0; u < 8; u++)
            {
                double sum = 0.0;
                for (int y = 0; y < 8; y++)
                {
                    sum += rowStage64[y * 8 + u] * BasisDouble[v, y];
                }
                dctFloat64[v * 8 + u] = sum;
                dctRounded64[v * 8 + u] = (int)System.Math.Round(sum);
            }
        }
    }

    public static void Inverse2D(
        int[] dequantBlock64,
        out double[] rowStage64,
        out double[] idctFloat64,
        out int[] idctRounded64,
        out byte[] clampedPixels64,
        bool fixedPoint = false)
    {
        rowStage64 = new double[64];
        idctFloat64 = new double[64];
        idctRounded64 = new int[64];
        clampedPixels64 = new byte[64];

        if (fixedPoint)
        {
            var rowQ3 = new int[64];
            for (int v = 0; v < 8; v++)
            {
                for (int x = 0; x < 8; x++)
                {
                    int acc = 0;
                    for (int u = 0; u < 8; u++)
                    {
                        acc += dequantBlock64[v * 8 + u] * BasisQ14[u, x];
                    }
                    int val = (acc + 1024) >> 11;
                    rowQ3[v * 8 + x] = val;
                    rowStage64[v * 8 + x] = val / 8.0;
                }
            }

            for (int y = 0; y < 8; y++)
            {
                for (int x = 0; x < 8; x++)
                {
                    int acc = 0;
                    for (int v = 0; v < 8; v++)
                    {
                        acc += rowQ3[v * 8 + x] * BasisQ14[v, y];
                    }
                    int val = (acc + 65536) >> 17;
                    idctFloat64[y * 8 + x] = val;
                    idctRounded64[y * 8 + x] = val;
                    clampedPixels64[y * 8 + x] = (byte)System.Math.Clamp(val + 128, 0, 255);
                }
            }
            return;
        }

        // Row-wise 1D IDCT: f_row[v, x] = sum_u F[v, u] * T[u, x]
        for (int v = 0; v < 8; v++)
        {
            for (int x = 0; x < 8; x++)
            {
                double sum = 0.0;
                for (int u = 0; u < 8; u++)
                {
                    sum += dequantBlock64[v * 8 + u] * BasisDouble[u, x];
                }
                rowStage64[v * 8 + x] = sum;
            }
        }

        // Column-wise 1D IDCT: f[y, x] = sum_v f_row[v, x] * T[v, y]
        for (int y = 0; y < 8; y++)
        {
            for (int x = 0; x < 8; x++)
            {
                double sum = 0.0;
                for (int v = 0; v < 8; v++)
                {
                    sum += rowStage64[v * 8 + x] * BasisDouble[v, y];
                }
                idctFloat64[y * 8 + x] = sum;
                int rounded = (int)System.Math.Round(sum);
                idctRounded64[y * 8 + x] = rounded;
                clampedPixels64[y * 8 + x] = (byte)System.Math.Clamp(rounded + 128, 0, 255);
            }
        }
    }
}
