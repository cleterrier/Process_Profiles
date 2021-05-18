// Correlate Profiles script by Christophe Leterrier
// Calculates the correlation of an intensity profile with itself (autocorrelation) or with the corresponding profile in another channel (crosscorrelation)
// Used to detect periodicity in intensity line profiles, as well as relationship between periodic patterns
// 2014: Similar to Zhong et al. eLife 2014 https://elifesciences.org/content/3/e0458114
// April 2017: Similar to d'Este et al. PNAS 2016 http://www.pnas.org/content/114/2/E191.abstract
// Allows to only plot the positive side or both positive and negative (correlation is symmetrical)
// May 2021: Compute crosscorrelations in addition to autocorrelation (name change from Autocorrelation_.js)

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

IJ.log("\n*****************************************************\nCorrelation has started!\n*****************************************************\n");

// Default variables
var profileLength_Def = 0; // profile length in um
var corrLength_Def = 1; // correlation span in um
var neg_Def = false; // include negative values in correlation
var profileWidth_Def = 0; // profile width in um

var plotSizeX = 800;
var plotSizeY = 512;

// Channels for the correlation
var ch1def = 0;
var ch2def = 1;

// Get maximum length
var maxLengthPx = 0;

for (var r = 0; r < nroi; r++) {
	rm.select(imp, r);
	var roi = ra[r];
	var prof = new ProfilePlot(imp);
	var coord = prof.getProfile();
	if (coord.length > maxLengthPx) maxLengthPx = coord.length;
}

var maxLength =  maxLengthPx * pxSize;

var nChan = stackDim[2]-1;

// Options Dialog
var gd = new GenericDialog("Correlation Options");
gd.addNumericField("Correlation first channel (0-" + nChan + "):", ch1def, 0, 3, "");
gd.addNumericField("Correlation second channel (0-" + nChan + "):", ch2def, 0, 3, "");
gd.addMessage("Scale: " + pxSize + " " + pxUnit + " per pixel");
gd.addNumericField("Max profile length:", maxLength, 0, 3, pxUnit);
gd.addNumericField("Correlation span:", corrLength_Def, 3, 5, pxUnit);
gd.addCheckbox("Include negative values", neg_Def);
gd.addNumericField("Profile width (0 to keep ROI width):", profileWidth_Def, 3, 5, pxUnit);
gd.showDialog();
var ch1 = gd.getNextNumber();
var ch2 = gd.getNextNumber();
var profileLength = gd.getNextNumber();
var chosenLength = gd.getNextNumber();
var corrLength = 2 * chosenLength;
var neg = gd.getNextBoolean();
var profileWidth = gd.getNextNumber();

// Main part

if (gd.wasOKed()) {

	// Create ProfileFits basket
	var allProfileFits = new Array(nroi);

	// Width and length in pixels
	var profileWidthPx = Math.round(profileWidth / pxSize);
	var profileLengthPx = Math.round(profileLength / pxSize);
	var corrLengthPx = Math.round(corrLength / pxSize);

	// Output name (with parameters)
	var outName = stackName + "_AC(l" + chosenLength + ",w" + profileWidth + ")";

	for (var r = 0; r < nroi; r++) {

		var currPF = new ProfileFit;

	// Get the names, labels and indexes
		currPF.pStackName = stackName;
		currPF.pSliceNumber = rm.getSliceNumber(rm.getName(r));
		currPF.pSliceLabel = stk.getShortSliceLabel(currPF.pSliceNumber);
		currPF.pRoiNumber = r;
		currPF.pRoiName = rm.getName(r);

	// Get the raw profile with the specified width

		// pull the ROI
		var roi = ra[r];
		// get initial width
		var iw = roi.getStrokeWidth();
		rm.select(imp, r);

		// set profile width if needed
		if (profileWidth > 0) rm.runCommand("Set Line Width", profileWidthPx);

		// get profile values
		imp.setC(ch1 + 1);
		var profPlot1 = new ProfilePlot(imp);
		var rawY1 = profPlot1.getProfile();
		imp.setC(ch2 + 1);
		var profPlot2 = new ProfilePlot(imp);
		var rawY2 = profPlot2.getProfile();

		// restore initial line width if needed
		if (profileWidth > 0) rm.runCommand("Set Line Width", iw);

	// Get scaled X coordinates
		var rawX = new Array(rawY1.length);
		for (var i = 0; i < rawY1.length; i++) {
			rawX[i] = i * pxSize;
		}

	// Crop raw profiles to profileLength if necessary
		currPF.pCropX = new Array(profileLengthPx);
		currPF.pCropY1 = new Array(profileLengthPx);
		currPF.pCropY2 = new Array(profileLengthPx);

		if (rawY1.length > profileLengthPx) {
			for (i = 0; i < profileLengthPx; i++) {
			currPF.pCropX[i] = rawX[i];
			currPF.pCropY1[i] = rawY1[i];
			currPF.pCropY2[i] = rawY2[i];
			}
		}
		else {
			currPF.pCropX = rawX;
			currPF.pCropY1 = rawY1;
			currPF.pCropY2 = rawY2;
		}

	// Get statistics of the profiles
		currPF.pStats1 = getStats(currPF.pCropY1);
		currPF.pStats2 = getStats(currPF.pCropY2);

	// Compute the autocorrelation
		var gxy = getAc(currPF.pCropY1, currPF.pCropY2, corrLengthPx, neg);

		var corrXpx = gxy[0];
		var corrY = gxy[1];

	// Get AC scaled X
		var corrX = new Array(corrXpx.length);
		for (var i = 0; i < corrX.length; i++) {
			corrX[i] = corrXpx[i] * pxSize;
		}

	// Assign autocorrelation coordinates
		currPF.pAcX = corrX;
		currPF.pAcY = corrY;


	// Get normalized autocorrelation coordinates
		currPF.pAcNY = normArray(currPF.pAcY, 1);

	// Get statistics of the normalized AC
		currPF.pAcStats = getStats(currPF.pAcNY);

	// Log the ProfileFit object
		IJ.log(printProfileFit(currPF));
	// Store the ProfileFit object
		allProfileFits[r] = currPF;

	}


// Output part

// Make profile stack

	// Create profiles stack
	var plotStacks = new ImageStack(plotSizeX, plotSizeY);

	// Looks for max and min of all plots to unify plot scale accross all features
	var plotMinAllY1 = getMinValue("pStats1[1]", allProfileFits);
	var plotMaxAllY1 = getMaxValue("pStats1[2]", allProfileFits);

	var plotMinAllY2 = getMinValue("pStats2[1]", allProfileFits);
	var plotMaxAllY2 = getMaxValue("pStats2[2]", allProfileFits);

	var plotMinAllY = Math.min(plotMinAllY1, plotMinAllY2);
	var plotMaxAllY = Math.min(plotMaxAllY1, plotMaxAllY2);

	// Set plot range
	var plotMaxX = profileLength; // length is defined by crop length
	var plotMinY = plotMinAllY - (plotMaxAllY - plotMinAllY) * 0.3;
	var plotMaxY = plotMaxAllY + (plotMaxAllY - plotMinAllY) * 0.3;


	// For each ProfileFit, generate the profile plot, and add a slice to the Profiles image stack
	for (var r = 0; r < allProfileFits.length; r++) {

		// Pull the ProfileFit object
		var currPF = allProfileFits[r];

		// Create the profile plot
		var prfPlot = new Plot("Profiles", pxUnit, "intensity");
		prfPlot.setSize(plotSizeX, plotSizeY);
		prfPlot.setLimits(0, plotMaxX, plotMinY, plotMaxY);

		// Add profile Y1
		prfPlot.setLineWidth(2);
		prfPlot.setColor(Color.MAGENTA);
		prfPlot.addPoints("", convertArrayF(currPF.pCropX), convertArrayF(currPF.pCropY1), Plot.LINE);
		if (ch1 != ch2) {
			prfPlot.setLineWidth(2);
			prfPlot.setColor(Color.GREEN);
			prfPlot.addPoints("", convertArrayF(currPF.pCropX), convertArrayF(currPF.pCropY2), Plot.LINE);
		}
		prfPlot.draw();

		// Get ip
		var PlotP = prfPlot.getProcessor();
		// Add ip to profiles stack
		plotStacks.addSlice(currPF.pSliceLabel + ":" + currPF.pRoiName, PlotP);
	}

	// Create i+ from the profiles stack
	var plotImp = new ImagePlus(outName + "_Profiles", plotStacks);
	// Show the profiles stack
	plotImp.show();

// Make autocorrelation (AC) stack

	// Create AC stack
	var acStacks = new ImageStack(plotSizeX, plotSizeY);

	// Looks for max and min of all plots to unify plot scale accross all features
	var plotAcMinAllY = getMinValue("pAcStats[1]", allProfileFits);
	var plotAcMaxAllY = getMaxValue("pAcStats[2]", allProfileFits);

	// Set plot range
	if (neg == true) var plotAcMinX = -corrLength/2; // length is defined by crop length
	else plotAcMinX = 0;
	var plotAcMaxX = corrLength/2;
	var plotAcMinY = plotAcMinAllY - (plotAcMaxAllY - plotAcMinAllY) * 0.3;
	var plotAcMaxY = plotAcMaxAllY + (plotAcMaxAllY - plotAcMinAllY) * 0.3;

	// For each ProfileFit, generate the autocorrelation plot, and add a slice to the Autocorrelations image stack
	for (var r = 0; r < allProfileFits.length; r++) {

		// Pull the ProfileFit object
		var currPF = allProfileFits[r];

		// Create the AC plot
		// var acPlot = new Plot("Correlations", pxUnit, "corr", convertArrayF(currPF.pAcX), convertArrayF(currPF.pAcNY));
		var acPlot = new Plot("Correlations", pxUnit, "corr");
		acPlot.setSize(plotSizeX, plotSizeY);
		acPlot.setLimits(plotAcMinX, plotAcMaxX, plotAcMinY, plotAcMaxY);

		// Add AC
		acPlot.setLineWidth(2);
		acPlot.setColor(Color.BLUE);
		acPlot.addPoints("", convertArrayF(currPF.pAcX), convertArrayF(currPF.pAcNY), Plot.LINE);
		acPlot.draw();

		// Get ip
		var acP = acPlot.getProcessor();
		// Add ip to profiles stack
		acStacks.addSlice(currPF.pSliceLabel + ":" + currPF.pRoiName, acP);
	}

	// i+ from the AC stack
	var acImp = new ImagePlus(outName + "_Corr", acStacks);
	// Show the AC stack
	acImp.show();


// Make Results Table

	// Initialize the Results Table
	var rt = new ResultsTable();
	var row = -1;

	for (var r = 0; r < allProfileFits.length; r++) {

		var CurrPF = allProfileFits[r];

		//log to Results Table
		rt.incrementCounter();
		row++;

		rt.setValue("Stack", row, CurrPF.pStackName);
		rt.setValue("Slice #", row, "" + CurrPF.pSliceNumber);
		rt.setValue("Slice", row, CurrPF.pSliceLabel);
		rt.setValue("Roi #", row, "" + CurrPF.pRoiNumber);
		rt.setValue("Roi", row, CurrPF.pRoiName);
		rt.setValue("Length", row, CurrPF.pStats1[0] * pxSize);
		rt.setValue("MinY1", row, CurrPF.pStats1[1]);
		rt.setValue("MaxY1", row, CurrPF.pStats1[2]);
		rt.setValue("MeanY1", row, CurrPF.pStats1[3]);
		rt.setValue("SDY1", row, CurrPF.pStats1[4]);
		if (ch1 != ch2) {
			rt.setValue("MinY2", row, CurrPF.pStats2[1]);
			rt.setValue("MaxY2", row, CurrPF.pStats2[2]);
			rt.setValue("MeanY2", row, CurrPF.pStats2[3]);
			rt.setValue("SDY2", row, CurrPF.pStats2[4]);
		}
		rt.setValue("AC Length", row, CurrPF.pAcStats[0] * pxSize);
		rt.setValue("AC Min", row, CurrPF.pAcStats[1]);
		rt.setValue("AC Max", row, CurrPF.pAcStats[2]);
		rt.setValue("AC Mean", row, CurrPF.pAcStats[3]);
		rt.setValue("AC SD", row, CurrPF.pAcStats[4])

	}

	// show the Results Table
	rt.show(outName + "_Results");
}


// Make Profiles table

		// Initialize the Profiles Table
		var pt = new ResultsTable();

		// X values
		var Profile = allProfileFits[0];
		for (var p = 0; p < maxLengthPx; p++) {
			pt.setValue("Scaled X", p, p * pxSize);
		}

		for (var r = 0; r < allProfileFits.length; r++) {

			var Profile = allProfileFits[r];

			for (p = 0; p < Profile.pCropY1.length; p++) {
				pt.setValue(Profile.pSliceLabel + ":" + Profile.pRoiName + ":Ch" + ch1, p, Profile.pCropY1[p]);
			}
			for (p = Profile.pCropY1.length; p < maxLengthPx; p++) {
				pt.setValue(Profile.pSliceLabel + ":" + Profile.pRoiName + ":Ch" + ch1, p, Number.NaN);
			}
			if (ch1 != ch2) {
				for (p = 0; p < Profile.pCropY2.length; p++) {
					pt.setValue(Profile.pSliceLabel + ":" + Profile.pRoiName + ":Ch" + ch2, p, Profile.pCropY2[p]);
				}
				for (p = Profile.pCropY2.length; p < maxLengthPx; p++) {
					pt.setValue(Profile.pSliceLabel + ":" + Profile.pRoiName + ":Ch" + ch2, p, Number.NaN);
				}

			}

		}
		// show the Profiles Table
		pt.show(outName + "_Profiles");


// Make AC table

		// Initialize the AC Table
		var act = new ResultsTable();

		// X values
		var Profile = allProfileFits[0];

		for (var p = 0; p < Profile.pAcX.length; p++) {
			act.setValue("Scaled X", p, Profile.pAcX[p]);
		}

		for (var r = 0; r < allProfileFits.length; r++) {

			var Profile = allProfileFits[r];

			for (var p = 0; p < Profile.pAcNY.length; p++) {
				act.setValue(Profile.pSliceLabel + ":" + Profile.pRoiName, p, Profile.pAcNY[p]);
			}
		}
		// show the Profiles Table
		act.show(outName + "Corr");




// Functions



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

// Compute statistics on an array: length, max, mean and sd
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

// Compute the correlation of two arrays
function getAc(a1, a2, s, n) {

	if (s == 0) s = Math.min(a1.length, a2.length);

	var aStats1 = getStats(a1);
	var aStats2 = getStats(a2);
	var amean1 = aStats1[3];
	var amean2 = aStats2[3];

	var avar1 = new Array(a1.length);
	var avar2 = new Array(a2.length);
	for (var i = 0; i < avar1.length; i++) {
		avar1[i] = a1[i] - amean1;
	}
	for (var i = 0; i < avar2.length; i++) {
		avar2[i] = a2[i] - amean2;
	}

	var mid = Math.floor(s / 2);
	var gx = new Array(2 * mid + 1);
	var gy = new Array(2 * mid + 1);
	if (neg == true) {
		var imin = - mid;
		var iref = mid;
		var gx = new Array(2 * mid + 1);
		var gy = new Array(2 * mid + 1);
	}
	 else {
	 	var imin = 0;
	 	var iref = 0;
	 	var gx = new Array(mid + 1);
		var gy = new Array(mid + 1);
	 }
	for (var i = imin; i < mid + 1; i++) {
		gx[iref + i] = i;
		var isum = 0;
		var inum = 0;
		for (t = Math.max(0, 0 - i); t < Math.min(a1.length - i, a1.length); t++) {
			isum += avar1[t] * avar2[t+i];
			inum ++;
		}
		gy[iref + i] = (isum / inum) / (amean1 * amean2);
	}
	return [gx, gy];
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

// Normalize an array according to first value
function normArrayFirst(a, max) {
	var na = new Array(a.length);
	for (var i = 0; i < a.length; i++) {
		na[i] = a[i] * max / a[0];
	}
	return na;
}

// Log the attributes of a PlotProfile
function printProfileFit(pf) {
	var logstring = "\n*** Correlated profiles ***\n";
	logstring += "Stack name: " + pf.pStackName + "\n";
	logstring += "Slice number: " + pf.pSliceNumber + "\n";
	logstring += "Slice label: " + pf.pSliceLabel + "\n";
	logstring += "Roi index: " + pf.pRoiNumber + "\n";
	logstring += "Roi name: " + pf.pRoiName + "\n";
	logstring += "X coordinates: " + printArraySample(pf.pCropX) + "\n";
	logstring += "Intensity values 1: " + printArraySample(pf.pCropY1) + "\n";
	if (ch1 != ch2)	logstring += "Intensity values 2: " + printArraySample(pf.pCropY2) + "\n";
	logstring += "Length (px):" + pf.pStats1[0] +"\n";
	logstring += "Length (um): " + (pf.pStats1[0] * pxSize) +"\n";
	logstring += "Min value Y1: " + pf.pStats1[1] + "\n";
	logstring += "Max value Y1: " + pf.pStats1[2] + "\n";
	logstring += "Mean intensity Y1: " + pf.pStats1[3] + "\n";
	logstring += "Standard deviation Y1: " + pf.pStats1[4] + "\n";
	if (ch1 != ch2) {
		logstring += "Min value Y2: " + pf.pStats2[1] + "\n";
		logstring += "Max value Y2: " + pf.pStats2[2] + "\n";
		logstring += "Mean intensity Y2: " + pf.pStats2[3] + "\n";
		logstring += "Standard deviation Y2: " + pf.pStats2[4] + "\n";
	}
	logstring += "Autocorrelation X: " + printArraySample(pf.pAcX) + "\n";
	logstring += "Autocorrelation Y: " + printArraySample(pf.pAcY) + "\n";
	logstring += "Normalized autocorrelation Y: " + printArraySample(pf.pAcNY) + "\n";
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

// Take the ProfileFits arrays and returns the max length for a given parameter array across all ProfileFits
function getMaxLength(f, pfs) {
	var fa = getAllValues(f, pfs);
	var max = fa[0];
	for (var i = 0; i < fa.length; i++) {
		if (fa[i].length > max) max = fa[i].length;
	}
	return max;
}

// Define the 'ProfileFit' object for storing results
function ProfileFit(pStackName, pSliceNumber, pSliceLabel, pRoiNumber, pRoiName, pCropX, pCropY1, pCropY2, pStats1, pStats2, pAcX, pAcY, pAcNY, pAcStats, pAc2pX, pAc2pY) {
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
	// array: profile Y1 cropped to profileLength
	this.pCropY1 = pCropY1;
	// array: profile Y2 cropped to profileLength
	this.pCropY2 = pCropY2;
	// array: stats of the Y1 profile
	this.pStats1 = pStats1;
	// array: stats of the Y2 profile
	this.pStats2 = pStats2;

	// array: correlation X (scaled)
	this.pAcX = pAcX;
	// array: correlation Y
	this.pAcY = pAcY;
	// array: correlation Y normalized
	this.pAcNY = pAcNY;
	// array: stats of the correlation
	this.pAcStats = pAcStats;
	// float: correlation 2nd peak X
	this.pAc2pX = pAc2pX;
	// float: correlation 2nd peak Y
	this.pAc2pY = pAc2pY;

}
