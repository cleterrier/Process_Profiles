// Fit_Sinus script by Christophe Leterrier
// 08-10-14

importClass(Packages.java.awt.Color);
importClass(Packages.ij.gui.Overlay);
importClass(Packages.java.awt.Polygon);
importClass(Packages.java.lang.Float);

importClass(Packages.ij.IJ);
importClass(Packages.ij.gui.GenericDialog);
importClass(Packages.ij.plugin.frame.RoiManager);
importClass(Packages.ij.gui.ProfilePlot);
importClass(Packages.ij.measure.CurveFitter);
importClass(Packages.ij.gui.Plot);
importClass(Packages.ij.gui.Roi);
importClass(Packages.ij.process.ImageProcessor);
importClass(Packages.ij.ImageStack);
importClass(Packages.ij.ImagePlus);
importClass(Packages.ij.measure.ResultsTable);

var imp = IJ.getImage();
var stk = imp.getImageStack();
var stackName = imp.getTitle();
var stackID = imp.getID();
var stackDim = imp.getDimensions();
var stackScale = getScale(imp);
var pxSize = stackScale[0];
var pxUnit = stackScale[1];
var rm = RoiManager.getInstance();
var ra = rm.getRoisAsArray();
var nroi = rm.getCount();

IJ.log("\n*****************************************************\nFitSinus has started!\n*****************************************************\n");

// Default variables
var profileLength_Def = 1; // profile length in nanometers
var profileWidth_Def = 0.4; // profile width in nanometers
var sinPeriod_Def = 0.190 ; // sinusoid period in nanometers
var fitPeriod_Def = false;

var plotSizeX = 800;
var plotSizeY = 512;

// Options Dialog
var gd = new GenericDialog("FitSinus Options");
gd.addMessage("Scale: " + pxSize + " " + pxUnit + " per pixel");
gd.addNumericField("Max profile length (end cropped):", profileLength_Def, 3, 4, pxUnit);
gd.addNumericField("Profile width (average):", profileWidth_Def, 3, 4, pxUnit);
gd.addCheckbox("Fit periodicity", fitPeriod_Def);
gd.addNumericField("Starting periodicity (fit seed):", sinPeriod_Def, 3, 4, pxUnit);
gd.showDialog();
var profileLength = gd.getNextNumber();
var profileWidth = gd.getNextNumber();
var fitPeriod = gd.getNextBoolean();
var sinPeriod = gd.getNextNumber();

// Main part
if (gd.wasOKed()) {

	var allProfileFits = new Array(nroi);
	var profileWidthPx = Math.round(profileWidth / pxSize);
	var profileLengthPx = Math.round(profileLength / pxSize);

	var outName = stackName + "_FS(l" + profileLength + ",w" + profileWidth;
	if (fitPeriod == true) outName += ",pVar)";
	else  outName += ",p" + sinPeriod + ")";

	for (var r = 0; r < nroi; r++) {

		var currPF = new ProfileFit;

		// get the names, labels and indexes
		currPF.pStackName = stackName;
		currPF.pSliceNumber = rm.getSliceNumber(rm.getName(r));
		currPF.pSliceLabel = stk.getShortSliceLabel(currPF.pSliceNumber);
		currPF.pRoiNumber = r;
		currPF.pRoiName = rm.getName(r);

		// get the raw profile with the specified width
		var roi = ra[r];
//		var roiT = roi.getTypeAsString();
		var iw = roi.getStrokeWidth();
		rm.select(imp, r);
		rm.runCommand("Set Line Width", profileWidthPx);
		var profPlot = new ProfilePlot(imp);
		var rawY = profPlot.getProfile();
		rm.runCommand("Set Line Width", iw);

		// get the scaled X
		var rawX = new Array(rawY.length);
		for (var i = 0; i < rawY.length; i++) {
			rawX[i] = i * pxSize;
		}

		// crop the raw profiles to profileLength if necessary
		currPF.pCropX = new Array(profileLengthPx);
		currPF.pCropY = new Array(profileLengthPx);
		if (rawY.length > profileLengthPx) {
			for (i = 0; i < profileLengthPx; i++) {
			currPF.pCropX[i] = rawX[i];
			currPF.pCropY[i] = rawY[i];
			}
		}
		else {
			currPF.pCropX = rawX;
			currPF.pCropY = rawY;
		}

		currPF.pStats = getStats(currPF.pCropY);

		// Define fitting equation and parameters

		if (fitPeriod == false) {
			currPF.pFitEq = "y = a* cos( (2*3.1415926/" + sinPeriod + ") * x - b) + c";
			currPF.pFitIni = [currPF.pStats[4], 0, currPF.pStats[3]];
		}
		else {
			currPF.pFitEq = "y = a* cos( (2*3.1415926/d) * x - b) + c";
			currPF.pFitIni = [currPF.pStats[4], 0, currPF.pStats[3], sinPeriod];
		}

		// perform the fit
		var profFitter = new CurveFitter(currPF.pCropX, currPF.pCropY);
		profFitter.doCustomFit(currPF.pFitEq, currPF.pFitIni, false);

		currPF.pFitParam = profFitter.getParams();
		currPF.pFitRS = profFitter.getRSquared();


		fitY = new Array(currPF.pStats[0]);
		for (var j = 0; j < currPF.pStats[0]; j++) {
			fitY[j] = profFitter.f(currPF.pFitParam, currPF.pCropX[j]);
		}
		currPF.pFitY = fitY;

		// Log the ProfileFit object
		IJ.log(printProfileFit(currPF));
		// Store the ProfileFit object
		allProfileFits[r] = currPF;

	}

// Make plots & fits stack

	var allProfilePlots = new Array(nroi);
	var plotStacks = new ImageStack(plotSizeX, plotSizeY);
	var plotMaxX = profileLength;

	// Looks for max and min of all plots to unify plot scale accross all features
	var plotMinAllY = getMinValue("pStats[1]", allProfileFits);
	var plotMaxAllY = getMaxValue("pStats[2]", allProfileFits);

	// For each Profile, generate the profile plot, and add a slice to the Profiles image stack
	for (var r = 0; r < allProfileFits.length; r++) {

		var currPF = allProfileFits[r];

		// generate the profile plot: add the profile, get the ip
		var plotMinY = plotMinAllY - (plotMaxAllY - plotMinAllY) * 0.3;
		var plotMaxY = plotMaxAllY + (plotMaxAllY - plotMinAllY) * 0.3;

		var prfPlot = new Plot("Profiles", pxUnit, "intensity", convertArrayF(currPF.pCropX), convertArrayF(currPF.pCropY));
		prfPlot.setSize(plotSizeX, plotSizeY);
		prfPlot.setLimits(0, plotMaxX, plotMinY, plotMaxY);


		prfPlot.setLineWidth(1);
		prfPlot.setColor(Color.GRAY);
		prfPlot.draw();

		prfPlot.setColor(Color.RED);
		prfPlot.setLineWidth(1);
		prfPlot.addPoints(convertArrayF(currPF.pCropX), convertArrayF(currPF.pFitY), Plot.LINE);

		prfPlot.addLabel(0.05, 0.04, "Fit: ampl= " + currPF.pFitParam[0].toFixed(3));
		prfPlot.addLabel(0.25, 0.04, "phase=" + currPF.pFitParam[1].toFixed(3));
		prfPlot.addLabel(0.45, 0.04, "offset=" + currPF.pFitParam[2].toFixed(3));
		if (fitPeriod == true) prfPlot.addLabel(0.65, 0.04, "period=" + currPF.pFitParam[3].toFixed(3));
		prfPlot.addLabel(0.85, 0.04, "R2=" + currPF.pFitRS.toFixed(3));

		prfPlot.draw;
		var PlotP = prfPlot.getProcessor();
		plotStacks.addSlice(currPF.pSliceLabel + ":" + currPF.pRoiName, PlotP);
	}

	// i+ from the Profiles image stack
	var plotImp = new ImagePlus(outName + "_Plots", plotStacks);
	// show the plots
	plotImp.show();

// Make Results Table
	// Initialize the Results Table
	var rt = new ResultsTable();
	var row = -1;

	for (var r = 0; r < allProfileFits.length; r++) {

		var CurrPF = allProfileFits[r];

		//log to Results Table
		rt.incrementCounter();
		row++;

		var fullName = CurrPF.pStackName + ":" + CurrPF.pSliceLabel + ":" + CurrPF.pRoiName ;

		rt.setValue("Stack", row, CurrPF.pStackName);
		rt.setValue("Slice #", row, "" + CurrPF.pSliceNumber);
		rt.setValue("Slice", row, CurrPF.pSliceLabel);
		rt.setValue("Roi #", row, "" + CurrPF.pRoiNumber);
		rt.setValue("Roi", row, CurrPF.pRoiName);
		rt.setValue("Length", row, CurrPF.pStats[0]);
		rt.setValue("Min", row, CurrPF.pStats[1]);
		rt.setValue("Min", row, CurrPF.pStats[2]);
		rt.setValue("Mean", row, CurrPF.pStats[3]);
		rt.setValue("Mean", row, CurrPF.pStats[4]);
		rt.setValue("Mean", row, CurrPF.pStats[4]);
		rt.setValue("Amplitude", row, CurrPF.pFitParam[0]);
		rt.setValue("Phase", row, CurrPF.pFitParam[1]);
		rt.setValue("Offset", row, CurrPF.pFitParam[2]);
		if (fitPeriod == true) {
			rt.setValue("Period", row, CurrPF.pFitParam[3]);
		}
		else {
			rt.setValue("Period", row, sinPeriod);
		}
		rt.setValue("R^2", row, CurrPF.pFitRS);

	}

	// show the Results Table
	rt.show(outName + "_Results");
}


// Utility to convert a javascript array into a java float array
function convertArrayF(arr) {
	var jArr = java.lang.reflect.Array.newInstance(java.lang.Float.TYPE, arr.length);
	for (var i = 0; i < arr.length; i++) {
   		jArr[i] = arr[i];
 	}
  	return jArr;
}

// Get the pixel size and units
function getScale(imp){
	var cal=imp.getCalibration();
	var scale=cal.getX(1);
	var unit=cal.getXUnit();
	return [scale , unit];
}

// Compute statistics on an array
function getStats(ar) {
	var min = ar[0];
	var max = ar[0];
	var sum = ar[0];
	for (var a = 1; a <ar.length; a++) {
		if (ar[a] < min) min = ar[a];
		if (ar[a] > max) max = ar[a];
		sum += ar[a];
	}
	mean = sum / ar.length;
	var res = 0;
	for (var a = 0; a < ar.length; a++) {
		res += ((mean - ar[a]) * (mean - ar[a]));
	}
	var sd = Math.sqrt(res / (ar.length - 1));
	return [ar.length, min, max, mean, sd];
}

// Normalize an array according to max
function normArray(a, max) {
	var na = new Array(a.length);
	aStats = getStats(a);
	for (var i = 0; i < a.length; i++) {
		na[i] = a[i] * max / aStats[2];
	}
	return na;
}

// Log the attributes of a PlotProfile
function printProfileFit(pf) {
	var logstring = "\n*** Profile Fit data ***\n";
	logstring += "Stack name: " + pf.pStackName + "\n";
	logstring += "Slice number: " + pf.pSliceNumber + "\n";
	logstring += "Slice label: " + pf.pSliceLabel + "\n";
	logstring += "Roi index: " + pf.pRoiNumber + "\n";
	logstring += "Roi name: " + pf.pRoiName + "\n";
	logstring += "X coordinates: " + printArraySample(pf.pCropX) + "\n";
	logstring += "Intensity values: " + printArraySample(pf.pCropY) + "\n";
	logstring += "Length (px):" + pf.pStats[0] +"\n";
	logstring += "Length (um): " + (pf.pStats[0] * pxSize) +"\n";
	logstring += "Min value: " + pf.pStats[1] + "\n";
	logstring += "Max value: " + pf.pStats[2] + "\n";
	logstring += "Mean intensity: " + pf.pStats[3] + "\n";
	logstring += "Standard deviation: " + pf.pStats[4] + "\n";
	logstring += "Fit equation: " + pf.pFitEq + "\n";
	logstring += "Fit initial parameters: " + printArrayFull(pf.pFitIni) + "\n";
	logstring += "Fit parameters: " + printArrayFull(pf.pFitParam) + "\n";
	logstring += "Fit R squared: " + pf.pFitRS + "\n";
	logstring += "Fit values: " + printArraySample(pf.pFitY) + "\n";
	return logstring;
}


// Log first and last two elements of an array, and its length
function printArraySample(Array) {
	if (Array.length < 2) return "*too small*";
	var string = "[ " + Array[0] + ", " + Array[1] + ", ... , " + Array[Array.length-2] + ", " + Array[Array.length-1] + " ] (length "+ Array.length + ")";
	return string;
}

// Log a whole array
function printArrayFull(Array) {
	var string = "[ ";
	for (var i = 0; i < Array.length-1; i++) {
		string += Array[i] + "\n";
	}
	string += Array[Array.length-1] + " ]";
	return string;
}


// Take the ProfileFits array and returns all values for a given parameter as an array
function getAllValues(f, pfs) {
	var fa = new Array(pfs.length);
	for (var i = 0; i < fa.length; i++) {
		string = "fa[i] = pfs[i]." + f;
		eval(string);
	}
	return fa;
}

// Take the ProfileFits arrays and returns the min value for a given parameter across all ProfileFits
function getMinValue(f, pfs) {
	var fa = getAllValues(f, pfs);
	var min = fa[0];
	for (var i = 1; i < fa.length; i++) {
		if (fa[i] < min) min = fa[i];
	}
	return min;
}

// Take the ProfileFits arrays and returns the max value for a given parameter across all ProfileFits
function getMaxValue(f, pfs) {
	var fa = getAllValues(f, pfs);
	var max = fa[0];
	for (var i = 0; i < fa.length; i++) {
		if (fa[i] > max) max = fa[i];
	}
	return max;
}

// Define the 'ProfileFit' object for storing results
function ProfileFit(pStackName, pSliceNumber, pSliceLabel, pRoiNumber, pRoiName, pCropX, pCropY, pStats, pFitEq, pFitIni, pFitY, pFitParam, pFitRS) {
	// string: source stack name
	this.pStackName = pStackName;
	// int: source slice number
	this.pSliceNumber = pSliceNumber;
	// string: source slice label
	this.pSliceLabel = pSliceLabel;
	// int: source ROI number
	this.pRoiNumber = pRoiNumber;
	// string: source ROI name
	this.pRoiName = pRoiName;

	// array: profile X (scaled) cropped to profileLength
	this.pCropX = pCropX;
	// array: profile Y cropped to profileLength
	this.pCropY = pCropY;
	// array: stats of the profile
	this.pStats = pStats;

	// variable: type of fit (equation)
	this.pFitEq = pFitEq;
	// array: Fit initial parameters
	this.pFitIni = pFitIni;
	// array: fitted profile Y
	this.pFitY = pFitY;
	// array: fit parameters
	this.pFitParam = pFitParam;
	// float: R squared of the fit
	this.pFitRS = pFitRS;

}
