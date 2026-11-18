// Combinational Zig-Zag <-> Raster index lookup table (8x8 JPEG block)
module zigzag_lut (
    input  wire [5:0] idx_in,
    output reg  [5:0] zz_to_raster,
    output reg  [5:0] raster_to_zz
);

    always @(*) begin
        case (idx_in)
            6'd0:  zz_to_raster = 6'd0;
            6'd1:  zz_to_raster = 6'd1;
            6'd2:  zz_to_raster = 6'd8;
            6'd3:  zz_to_raster = 6'd16;
            6'd4:  zz_to_raster = 6'd9;
            6'd5:  zz_to_raster = 6'd2;
            6'd6:  zz_to_raster = 6'd3;
            6'd7:  zz_to_raster = 6'd10;
            6'd8:  zz_to_raster = 6'd17;
            6'd9:  zz_to_raster = 6'd24;
            6'd10: zz_to_raster = 6'd32;
            6'd11: zz_to_raster = 6'd25;
            6'd12: zz_to_raster = 6'd18;
            6'd13: zz_to_raster = 6'd11;
            6'd14: zz_to_raster = 6'd4;
            6'd15: zz_to_raster = 6'd5;
            6'd16: zz_to_raster = 6'd12;
            6'd17: zz_to_raster = 6'd19;
            6'd18: zz_to_raster = 6'd26;
            6'd19: zz_to_raster = 6'd33;
            6'd20: zz_to_raster = 6'd40;
            6'd21: zz_to_raster = 6'd48;
            6'd22: zz_to_raster = 6'd41;
            6'd23: zz_to_raster = 6'd34;
            6'd24: zz_to_raster = 6'd27;
            6'd25: zz_to_raster = 6'd20;
            6'd26: zz_to_raster = 6'd13;
            6'd27: zz_to_raster = 6'd6;
            6'd28: zz_to_raster = 6'd7;
            6'd29: zz_to_raster = 6'd14;
            6'd30: zz_to_raster = 6'd21;
            6'd31: zz_to_raster = 6'd28;
            6'd32: zz_to_raster = 6'd35;
            6'd33: zz_to_raster = 6'd42;
            6'd34: zz_to_raster = 6'd49;
            6'd35: zz_to_raster = 6'd56;
            6'd36: zz_to_raster = 6'd57;
            6'd37: zz_to_raster = 6'd50;
            6'd38: zz_to_raster = 6'd43;
            6'd39: zz_to_raster = 6'd36;
            6'd40: zz_to_raster = 6'd29;
            6'd41: zz_to_raster = 6'd22;
            6'd42: zz_to_raster = 6'd15;
            6'd43: zz_to_raster = 6'd23;
            6'd44: zz_to_raster = 6'd30;
            6'd45: zz_to_raster = 6'd37;
            6'd46: zz_to_raster = 6'd44;
            6'd47: zz_to_raster = 6'd51;
            6'd48: zz_to_raster = 6'd58;
            6'd49: zz_to_raster = 6'd59;
            6'd50: zz_to_raster = 6'd52;
            6'd51: zz_to_raster = 6'd45;
            6'd52: zz_to_raster = 6'd38;
            6'd53: zz_to_raster = 6'd31;
            6'd54: zz_to_raster = 6'd39;
            6'd55: zz_to_raster = 6'd46;
            6'd56: zz_to_raster = 6'd53;
            6'd57: zz_to_raster = 6'd60;
            6'd58: zz_to_raster = 6'd61;
            6'd59: zz_to_raster = 6'd54;
            6'd60: zz_to_raster = 6'd47;
            6'd61: zz_to_raster = 6'd55;
            6'd62: zz_to_raster = 6'd62;
            6'd63: zz_to_raster = 6'd63;
            default: zz_to_raster = 6'd0;
        endcase
    end

    always @(*) begin
        case (idx_in)
            6'd0:  raster_to_zz = 6'd0;
            6'd1:  raster_to_zz = 6'd1;
            6'd2:  raster_to_zz = 6'd5;
            6'd3:  raster_to_zz = 6'd6;
            6'd4:  raster_to_zz = 6'd14;
            6'd5:  raster_to_zz = 6'd15;
            6'd6:  raster_to_zz = 6'd27;
            6'd7:  raster_to_zz = 6'd28;
            6'd8:  raster_to_zz = 6'd2;
            6'd9:  raster_to_zz = 6'd4;
            6'd10: raster_to_zz = 6'd7;
            6'd11: raster_to_zz = 6'd13;
            6'd12: raster_to_zz = 6'd16;
            6'd13: raster_to_zz = 6'd26;
            6'd14: raster_to_zz = 6'd29;
            6'd15: raster_to_zz = 6'd42;
            6'd16: raster_to_zz = 6'd3;
            6'd17: raster_to_zz = 6'd8;
            6'd18: raster_to_zz = 6'd12;
            6'd19: raster_to_zz = 6'd17;
            6'd20: raster_to_zz = 6'd25;
            6'd21: raster_to_zz = 6'd30;
            6'd22: raster_to_zz = 6'd41;
            6'd23: raster_to_zz = 6'd43;
            6'd24: raster_to_zz = 6'd9;
            6'd25: raster_to_zz = 6'd11;
            6'd26: raster_to_zz = 6'd18;
            6'd27: raster_to_zz = 6'd24;
            6'd28: raster_to_zz = 6'd31;
            6'd29: raster_to_zz = 6'd40;
            6'd30: raster_to_zz = 6'd44;
            6'd31: raster_to_zz = 6'd53;
            6'd32: raster_to_zz = 6'd10;
            6'd33: raster_to_zz = 6'd19;
            6'd34: raster_to_zz = 6'd23;
            6'd35: raster_to_zz = 6'd32;
            6'd36: raster_to_zz = 6'd39;
            6'd37: raster_to_zz = 6'd45;
            6'd38: raster_to_zz = 6'd52;
            6'd39: raster_to_zz = 6'd54;
            6'd40: raster_to_zz = 6'd20;
            6'd41: raster_to_zz = 6'd22;
            6'd42: raster_to_zz = 6'd33;
            6'd43: raster_to_zz = 6'd38;
            6'd44: raster_to_zz = 6'd46;
            6'd45: raster_to_zz = 6'd51;
            6'd46: raster_to_zz = 6'd55;
            6'd47: raster_to_zz = 6'd60;
            6'd48: raster_to_zz = 6'd21;
            6'd49: raster_to_zz = 6'd34;
            6'd50: raster_to_zz = 6'd37;
            6'd51: raster_to_zz = 6'd47;
            6'd52: raster_to_zz = 6'd50;
            6'd53: raster_to_zz = 6'd56;
            6'd54: raster_to_zz = 6'd59;
            6'd55: raster_to_zz = 6'd61;
            6'd56: raster_to_zz = 6'd35;
            6'd57: raster_to_zz = 6'd36;
            6'd58: raster_to_zz = 6'd48;
            6'd59: raster_to_zz = 6'd49;
            6'd60: raster_to_zz = 6'd57;
            6'd61: raster_to_zz = 6'd58;
            6'd62: raster_to_zz = 6'd62;
            6'd63: raster_to_zz = 6'd63;
            default: raster_to_zz = 6'd0;
        endcase
    end

endmodule
